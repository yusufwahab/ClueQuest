import { createServer, type Server } from 'node:http';
import { io as ioc, type Socket } from 'socket.io-client';
import { createApp, type AppHandle } from '../app';

export interface Harness { app: AppHandle; base: string; port: number; close(): Promise<void> }

export async function boot(env: Record<string, string> = {}): Promise<Harness> {
  const app = await createApp({
    NODE_ENV: 'test', DB_DRIVER: 'pglite', EMAIL_MODE: 'log', RATE_LIMIT_DISABLED: 'true', ANSWER_GRACE_MS: '100',
    WEBHOOK_BACKOFF_MS: '50', PUBLIC_WEB_URL: 'http://web.test', ...env,
  });
  const port = await app.listen(0);
  return { app, port, base: `http://localhost:${port}`, close: () => app.close() };
}

export async function api(h: Harness, method: string, path: string, opts: { body?: unknown; token?: string; attempt?: string; partnerKey?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.partnerKey) headers.authorization = `Bearer ${opts.partnerKey}`;
  if (opts.attempt) headers['x-attempt-token'] = opts.attempt;
  const res = await fetch(`${h.base}/api${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

let n = 0;
export async function teacher(h: Harness) {
  const r = await api(h, 'POST', '/auth/register', { body: { email: `t${++n}-${Date.now()}@test.dev`, password: 'password123', displayName: 'Teacher' } });
  return r.body.token as string;
}

/** 3 questions, different marks and points so the three scores can be told apart. Option ids o1..o3, correct = o1. */
export const sampleQuiz = {
  title: 'Fractions', subject: 'Mathematics', instructions: 'Answer all questions.',
  questions: [1, 2, 3].map((i) => ({
    id: `q${i}`, text: `Question ${i}?`, marks: i, points: i * 100, explanation: `Because ${i}`,
    options: [{ id: 'o1', text: 'Right' }, { id: 'o2', text: 'Wrong' }, { id: 'o3', text: 'Also wrong' }], correctId: 'o1',
  })),
};

export async function publishedQuiz(h: Harness, token: string, allowPartners = false) {
  const q = await api(h, 'POST', '/quizzes', { token, body: sampleQuiz });
  const id = q.body.id as string;
  const p = await api(h, 'POST', `/quizzes/${id}/publish`, { token });
  if (p.status !== 200) throw new Error(`publish failed ${JSON.stringify(p.body)}`);
  if (allowPartners) await api(h, 'PUT', `/quizzes/${id}/partner-access`, { token, body: { allow: true } });
  return id;
}

export function connect(h: Harness, auth: Record<string, string>): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioc(h.base, { auth, transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', (e) => reject(e));
  });
}
export const ask = (s: Socket, ev: string, body: unknown) => new Promise<any>((resolve) => s.emit(ev, body, resolve));
export function nextState(s: Socket, pred: (st: any) => boolean, ms = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { s.off('state', on); reject(new Error('timeout waiting for state')); }, ms);
    const on = (st: any) => { if (pred(st)) { clearTimeout(t); s.off('state', on); resolve(st); } };
    s.on('state', on);
    s.emit('sync', {}, (r: any) => { if (r?.ok) on(r.data); });
  });
}

/** A minimal partner webhook receiver. `failFirst` responses are 500s; every request is recorded. */
export async function fakePartner(failFirst = 0) {
  const received: { headers: Record<string, any>; body: string }[] = [];
  let calls = 0;
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls++;
      received.push({ headers: req.headers, body });
      res.statusCode = calls <= failFirst ? 500 : 200;
      res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  return { port, url: `http://localhost:${port}/hook`, received, close: () => new Promise<void>((r) => server.close(() => r())) };
}
