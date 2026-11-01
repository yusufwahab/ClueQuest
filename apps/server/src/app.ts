import { createServer } from 'node:http';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { Server as IOServer } from 'socket.io';
import { ZodError } from 'zod';
import { Auth } from './auth';
import { migrate, openDb, type Db } from './db/db';
import { HttpError } from './db/util';
import { loadEnv, type Env } from './env';
import { Mailer } from './email';
import { AiService } from './ai';
import { QuizService } from './quizzes';
import { AttemptService } from './attempts';
import { LiveService } from './live';
import { PartnerService, WebhookWorker } from './partners';
import { limiter, makeCounter } from './ratelimit';
import { routes } from './routes';
import { attachSockets } from './socket';
import { seedDevData } from './db/devseed';
import type { Ctx } from './ctx';

export interface AppHandle {
  env: Env; db: Db; ctx: Ctx; io: IOServer; server: ReturnType<typeof createServer>;
  listen(port?: number): Promise<number>; close(): Promise<void>;
}

export async function createApp(envOverrides: Record<string, string | undefined> = {}, existingDb?: Db): Promise<AppHandle> {
  const env = loadEnv({ ...process.env, ...envOverrides });
  const db = existingDb ?? (await openDb(env));
  await migrate(db, { dev: env.DB_DRIVER === 'pglite' });

  const counter = makeCounter(env);
  const mailer = new Mailer(env);
  const auth = new Auth(env, db);
  const quizzes = new QuizService(db, env, mailer);
  const attempts = new AttemptService(db, env, quizzes);
  const live = new LiveService(db, env, quizzes);
  const partners = new PartnerService(db, env, quizzes);
  const webhooks = new WebhookWorker(db, env);
  attempts.onSubmitted = (id) => { void webhooks.deliverForAttempt(id).catch(() => undefined); };
  const ctx: Ctx = { env, db, auth, quizzes, attempts, live, partners, webhooks, mailer, ai: new AiService(env), limit: limiter(counter, env) };
  if (env.SEED_DEV_DATA) await seedDevData(ctx);

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // CORS only lets our own web origins read responses. Credentials travel as bearer / attempt-token headers, never cookies.
  app.use(cors({ origin: env.ALLOWED_ORIGINS, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['content-type', 'authorization', 'x-attempt-token'], maxAge: 600 }));
  app.use(express.json({ limit: '512kb' }));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.get('/readyz', async (_req, res) => { try { await db.query('select 1'); res.json({ ok: true, db: db.kind }); } catch { res.status(503).json({ ok: false }); } });
  app.use('/api', routes(ctx));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found', 'not_found')));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message, code: err.code, ...(err.extra ? { details: err.extra } : {}) });
    if (err instanceof ZodError) return void res.status(400).json({ error: err.issues[0]?.message ?? 'Please check the form', code: 'invalid', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    if ((err as any)?.type === 'entity.too.large') return void res.status(413).json({ error: 'Request too large', code: 'too_big' });
    if (err instanceof SyntaxError) return void res.status(400).json({ error: 'Malformed JSON', code: 'invalid' });
    console.error('[http] unexpected error', req.method, req.path, (err as Error)?.message); // never log bodies (answers, tokens)
    res.status(500).json({ error: 'Something went wrong', code: 'internal' });
  });

  const server = createServer(app);
  const io = new IOServer(server, { cors: { origin: env.ALLOWED_ORIGINS }, maxHttpBufferSize: 10_000, pingInterval: 20_000, pingTimeout: 20_000, transports: ['websocket', 'polling'] });
  attachSockets(io, ctx);

  await live.recover();
  webhooks.start(1000);
  const sweep = setInterval(() => { attempts.sweep().catch((e) => console.error('[sweep]', e)); }, 5000);
  sweep.unref();

  return {
    env, db, ctx, io, server,
    listen: (port = env.PORT) => new Promise((resolve) => server.listen(port, () => resolve((server.address() as { port: number }).port))),
    close: async () => {
      clearInterval(sweep); webhooks.stop(); live.stop();
      await new Promise<void>((r) => { io.close(() => r()); });
      await counter.close();
      if (!existingDb) await db.close();
    },
  };
}
