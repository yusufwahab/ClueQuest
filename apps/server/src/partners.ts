import { createHmac, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { launchSchema } from '@cluequest/contracts';
import type { Db } from './db/db';
import { HttpError, many, one, sha256 } from './db/util';
import type { Env } from './env';
import type { QuizService } from './quizzes';

export interface PartnerRow { id: string; slug: string; name: string; webhook_url: string; webhook_secret: string; return_origins: string[]; active: boolean }
declare module 'express-serve-static-core' { interface Request { partner?: PartnerRow } }

export const signWebhook = (secret: string, timestamp: string, body: string) =>
  `v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

const originOf = (u: string) => { try { return new URL(u).origin; } catch { return null; } };

export class PartnerService {
  constructor(private db: Db, private env: Env, private quizzes: QuizService) {}

  /** Create a partner. The API key and webhook secret are shown once; only the key's hash is stored. */
  async create(p: { slug: string; name: string; webhookUrl: string; returnOrigins: string[]; apiKey?: string; webhookSecret?: string }) {
    const apiKey = p.apiKey ?? `cq_live_${randomBytes(24).toString('base64url')}`;
    const webhookSecret = p.webhookSecret ?? `whsec_${randomBytes(24).toString('base64url')}`;
    const origins = p.returnOrigins.map((o) => originOf(o)).filter((o): o is string => !!o);
    await this.db.query(
      `insert into partners(slug,name,api_key_hash,webhook_url,webhook_secret,return_origins) values ($1,$2,$3,$4,$5,$6)
       on conflict (slug) do update set name=excluded.name, api_key_hash=excluded.api_key_hash, webhook_url=excluded.webhook_url, webhook_secret=excluded.webhook_secret, return_origins=excluded.return_origins, active=true`,
      [p.slug, p.name, sha256(apiKey), p.webhookUrl, webhookSecret, origins]);
    return { apiKey, webhookSecret };
  }

  /** Express middleware for /api/partner/v1: the bearer key identifies exactly one partner. */
  authenticate() {
    return async (req: Request, _res: Response, next: NextFunction) => {
      const h = req.headers.authorization;
      const key = h?.startsWith('Bearer ') ? h.slice(7) : '';
      const p = key ? await one<PartnerRow>(this.db, 'select * from partners where api_key_hash=$1 and active', [sha256(key)]) : undefined;
      if (!p) return next(new HttpError(401, 'Invalid API key', 'unauthenticated'));
      req.partner = p; next();
    };
  }

  /** Quiz lookup: published + opted in for connected platforms. Reveals only title/version/type metadata. */
  async lookup(quizId: string) {
    if (!/^[0-9a-f-]{36}$/.test(quizId)) throw new HttpError(404, 'Quiz not found', 'not_found');
    const q = await one<any>(this.db, 'select * from quizzes where id=$1', [quizId]);
    if (!q || q.status !== 'published' || !q.latest_version || !q.allow_partners) throw new HttpError(404, 'Quest not found or not available to partners', 'not_found');
    const v = await this.quizzes.getVersion(q.id, q.latest_version);
    return {
      quizId: q.id, title: v.title, subject: v.subject, published: true, version: v.version, questionCount: v.questions.length,
      totalMarks: v.questions.reduce((n, x) => n + x.marks, 0),
      activityTypes: ['solo', 'cbt'], styles: ['points', 'steps'],
    };
  }

  /** Assignment launch. Idempotent per (partner, assignmentRef): the first call pins the quiz version and rules. */
  async launch(partner: PartnerRow, raw: unknown) {
    const b = launchSchema.parse(raw);
    const origin = originOf(b.returnUrl);
    if (!origin || !partner.return_origins.includes(origin)) throw new HttpError(422, 'returnUrl is not an approved return destination for this partner', 'bad_return_url');
    let act = await one<any>(this.db, 'select * from activities where partner_id=$1 and assignment_ref=$2', [partner.id, b.assignmentRef]);
    if (act && act.quiz_id !== b.quizId) throw new HttpError(409, 'This assignment is already linked to a different quiz', 'assignment_conflict');
    if (!act) {
      const info = await this.lookup(b.quizId);
      const a = b.activity;
      if (a.type === 'cbt' && !a.durationMinutes) throw new HttpError(422, 'activity.durationMinutes is required for cbt', 'bad_duration');
      this.quizzes.assertSettings({ mode: a.type, opensAt: a.opensAt, closesAt: a.closesAt, durationMinutes: a.durationMinutes });
      const q = await one<any>(this.db, 'select owner_id from quizzes where id=$1', [b.quizId]);
      const settings = {
        steps: a.steps ?? { wrong: 'stay' }, passMarkPercent: a.passMarkPercent ?? null, instantFeedback: a.instantFeedback ?? false,
        attemptLimit: a.attemptLimit ?? (a.type === 'cbt' ? 1 : null), durationMinutes: a.durationMinutes ?? null,
        opensAt: a.opensAt ?? null, closesAt: a.closesAt ?? null, release: 'immediate', showAnswers: true, secondsPerQuestion: 30,
      };
      try {
        const created = await this.quizzes.insertActivity({ ownerId: q.owner_id, quizId: b.quizId, version: info.version, mode: a.type, style: a.style, title: info.title, settings, partnerId: partner.id, assignmentRef: b.assignmentRef });
        act = await this.quizzes.activityById(created.id);
      } catch (e) {
        if (!/activities_partner_ref|duplicate key/.test(String((e as Error).message))) throw e;
        act = await one<any>(this.db, 'select * from activities where partner_id=$1 and assignment_ref=$2', [partner.id, b.assignmentRef]);
      }
    }
    const token = randomBytes(24).toString('base64url');
    const expires = new Date(Date.now() + this.env.LAUNCH_TTL_MINUTES * 60_000);
    await this.db.query('insert into launches(partner_id,activity_id,learner_ref,learner_name,return_url,token_hash,expires_at) values ($1,$2,$3,$4,$5,$6,$7)',
      [partner.id, act.id, b.learnerRef, b.learnerName ?? null, b.returnUrl, sha256(token), expires]);
    return { launchUrl: `${this.env.PUBLIC_WEB_URL}/launch/${token}`, expiresAt: expires.toISOString(), quizVersion: act.quiz_version, activityType: act.mode, style: act.style };
  }

  async launchByToken(token: string) {
    const l = await one<any>(this.db, 'select * from launches where token_hash=$1', [sha256(token)]);
    if (!l) throw new HttpError(404, 'This launch link is not valid', 'not_found');
    if (new Date(l.expires_at).getTime() < Date.now()) throw new HttpError(410, 'This launch link has expired. Open the assignment again from your class.', 'launch_expired');
    return { launch: l, activity: await this.quizzes.activityById(l.activity_id) };
  }

  async attemptForPartner(partner: PartnerRow, attemptId: string) {
    const r = await one<any>(this.db, 'select payload from webhook_deliveries where attempt_id=$1 and partner_id=$2', [attemptId, partner.id]);
    if (!r) throw new HttpError(404, 'Result not found', 'not_found');
    return r.payload;
  }
}

/** Outbox worker: signed POSTs, exponential backoff, one logical event per attempt (same eventId on every retry). */
export class WebhookWorker {
  private timer?: ReturnType<typeof setInterval>;
  private inflight = new Set<string>();
  constructor(private db: Db, private env: Env) {}

  start(everyMs = 1000) {
    this.timer = setInterval(() => { void this.tick(); }, everyMs);
    this.timer.unref();
  }
  stop() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    const due = await many<any>(this.db, "select id from webhook_deliveries where status='pending' and next_at <= now() order by next_at limit 20");
    await Promise.all(due.map((d) => this.deliver(d.id)));
  }
  async deliverForAttempt(attemptId: string) {
    const d = await one<any>(this.db, "select id from webhook_deliveries where attempt_id=$1 and status='pending'", [attemptId]);
    if (d) await this.deliver(d.id);
  }

  private async deliver(id: string) {
    if (this.inflight.has(id)) return;
    this.inflight.add(id);
    try {
      const d = await one<any>(this.db, `select d.*, p.webhook_url, p.webhook_secret from webhook_deliveries d join partners p on p.id=d.partner_id where d.id=$1 and d.status='pending'`, [id]);
      if (!d) return;
      const body = JSON.stringify(d.payload);
      const ts = String(Math.floor(Date.now() / 1000));
      let error: string | null = null;
      try {
        const res = await fetch(d.webhook_url, {
          method: 'POST', signal: AbortSignal.timeout(10_000),
          headers: {
            'content-type': 'application/json', 'x-cluequest-event-id': d.event_id, 'x-cluequest-timestamp': ts,
            'x-cluequest-signature': signWebhook(d.webhook_secret, ts, body), 'x-cluequest-delivery-attempt': String(d.tries + 1),
          },
          body,
        });
        if (!res.ok) error = `Partner responded ${res.status}`;
      } catch (e) { error = (e as Error).message; }
      if (!error) {
        await this.db.query("update webhook_deliveries set status='delivered', tries=tries+1, delivered_at=now(), last_error=null where id=$1", [id]);
      } else {
        const tries = d.tries + 1;
        const giveUp = tries >= this.env.WEBHOOK_MAX_TRIES;
        const delay = Math.min(this.env.WEBHOOK_BACKOFF_MS * 2 ** (tries - 1), 6 * 3600_000);
        await this.db.query("update webhook_deliveries set tries=$2, last_error=$3, status=$4, next_at=$5 where id=$1", [id, tries, error.slice(0, 300), giveUp ? 'failed' : 'pending', new Date(Date.now() + delay)]);
      }
    } finally { this.inflight.delete(id); }
  }
}
