import { createHmac, timingSafeEqual } from 'node:crypto';
import { gradeAttempt, hasPassed, optionOrder, scheduleState, type GradedQuestion } from '@cluequest/game-core';
import type { ResultEvent } from '@cluequest/contracts';
import type { Db, Queryable } from './db/db';
import { HttpError, many, one, sha256 } from './db/util';
import type { Env } from './env';
import type { QuizService, StoredQuestion } from './quizzes';
import { imageView } from './images';

export const isoOrNull = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/** Learner-facing question: no answer key, no explanation, per-attempt option order. */
export function publicQuestion(q: StoredQuestion, attemptId: string, env: Env) {
  return { id: q.id, text: q.text, image: imageView(env, q.image), marks: q.marks, points: q.points, options: optionOrder(q.options, attemptId, q.id) };
}
export const graded = (qs: StoredQuestion[]): GradedQuestion[] => qs.map((q) => ({ id: q.id, correctId: q.correctId, marks: q.marks, points: q.points }));

export class AttemptService {
  /** Called after every submission so the partner outbox can deliver without waiting for the next poll. */
  onSubmitted?: (attemptId: string) => void;
  constructor(private db: Db, private env: Env, private quizzes: QuizService) {}

  // The attempt credential is derived from the attempt id, so refreshing, re-opening a launch link or a second
  // tab all resume the same attempt without rotating (and invalidating) anything.
  private sign(id: string) { return createHmac('sha256', this.env.AUTH_SECRET).update(`attempt:${id}`).digest('base64url'); }
  tokenFor(id: string) { return `${id}.${this.sign(id)}`; }
  parseToken(token: string | undefined): string {
    const [id, sig] = (token ?? '').split('.');
    if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(401, 'Attempt not recognised', 'bad_attempt');
    const a = Buffer.from(sig); const b = Buffer.from(this.sign(id));
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Attempt not recognised', 'bad_attempt');
    return id;
  }

  /** Window + permission rules for starting. */
  private assertCanStart(act: any, who: { invitationId?: string; learnerRef?: string }) {
    const s = act.settings as any;
    if (act.status !== 'open') throw new HttpError(403, 'This quest is closed', 'closed');
    if (act.mode === 'live') throw new HttpError(422, 'This is a live game. Join it with a room code.', 'wrong_mode');
    if (act.mode === 'cbt' && !who.invitationId && !who.learnerRef) throw new HttpError(403, 'This exam needs your personal invitation link', 'needs_identity');
    const now = Date.now();
    if (act.mode === 'solo') {
      const sc = scheduleState(s, now);
      if (!sc.open) throw new HttpError(403, 'This quest has not started yet', 'not_started', { startsAt: sc.startsAt, startMode: sc.mode });
    }
    if (s.opensAt && now < new Date(s.opensAt).getTime()) throw new HttpError(403, `This exam opens at ${s.opensAt}`, 'not_open', { opensAt: s.opensAt });
    if (s.closesAt && now > new Date(s.closesAt).getTime()) throw new HttpError(403, 'This exam has closed', 'closed', { closesAt: s.closesAt });
  }

  /** Start a new attempt, or resume the in-progress one for the same identity. Never consumes an extra attempt. */
  async start(act: any, who: { name?: string; invitationId?: string; learnerRef?: string; partnerId?: string; returnUrl?: string }) {
    this.assertCanStart(act, who);
    const identity = who.invitationId ? `i:${who.invitationId}` : who.learnerRef ? `l:${who.learnerRef}` : null;
    const s = act.settings as any;
    if (identity) {
      await this.sweepOne(act.id, identity);
      const open = await one<any>(this.db, "select id from attempts where activity_id=$1 and identity_key=$2 and status='in_progress'", [act.id, identity]);
      if (open) return { attemptId: open.id, token: this.tokenFor(open.id), resumed: true };
      if (s.attemptLimit != null) {
        const used = await one<any>(this.db, 'select count(*)::int as n from attempts where activity_id=$1 and identity_key=$2', [act.id, identity]);
        if (used.n >= s.attemptLimit) throw new HttpError(403, 'You have used all your attempts', 'attempt_limit', { limit: s.attemptLimit });
      }
    }
    const now = Date.now();
    let deadline: number | null = null;
    if (act.mode === 'cbt') {
      deadline = now + (s.durationMinutes ?? 60) * 60_000;
      if (s.closesAt) deadline = Math.min(deadline, new Date(s.closesAt).getTime());
    }
    try {
      const r = await one<any>(this.db,
        `insert into attempts(activity_id,quiz_id,quiz_version,style,partner_id,learner_ref,invitation_id,identity_key,player_name,token_hash,deadline_at,return_url)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,gen_random_uuid()::text,$10,$11) returning id`,
        [act.id, act.quiz_id, act.quiz_version, act.style, who.partnerId ?? act.partner_id ?? null, who.learnerRef ?? null, who.invitationId ?? null, identity, (who.name ?? '').slice(0, 60), deadline ? new Date(deadline) : null, who.returnUrl ?? null]);
      return { attemptId: r.id as string, token: this.tokenFor(r.id), resumed: false };
    } catch (e) {
      // A double-click raced us: the unique "one open attempt per identity" index sends us to the winner.
      if (identity && /attempts_one_open|duplicate key/.test(String((e as Error).message))) {
        const open = await one<any>(this.db, "select id from attempts where activity_id=$1 and identity_key=$2 and status='in_progress'", [act.id, identity]);
        if (open) return { attemptId: open.id, token: this.tokenFor(open.id), resumed: true };
      }
      throw e;
    }
  }

  private async load(attemptId: string, q: Queryable = this.db) {
    const a = await one<any>(q, 'select a.*, row_to_json(c.*) as activity from attempts a join activities c on c.id=a.activity_id where a.id=$1', [attemptId]);
    if (!a) throw new HttpError(404, 'Attempt not found', 'not_found');
    return a;
  }

  /** Server-side deadline enforcement: an attempt past its deadline is submitted with whatever was autosaved. */
  private async expireIfNeeded(a: any): Promise<any> {
    if (a.status === 'in_progress' && a.deadline_at && Date.now() > new Date(a.deadline_at).getTime() + this.env.ANSWER_GRACE_MS) {
      await this.submitInternal(a.id, true);
      return this.load(a.id);
    }
    return a;
  }
  private async sweepOne(activityId: string, identity: string) {
    const r = await one<any>(this.db, "select id from attempts where activity_id=$1 and identity_key=$2 and status='in_progress'", [activityId, identity]);
    if (r) await this.expireIfNeeded(await this.load(r.id));
  }
  async sweep() {
    const rows = await many<any>(this.db, "select id from attempts where status='in_progress' and deadline_at is not null and deadline_at < now() - ($1 || ' milliseconds')::interval", [String(this.env.ANSWER_GRACE_MS)]);
    for (const r of rows) await this.submitInternal(r.id, true).catch((e) => console.error('[sweep]', e));
    return rows.length;
  }

  async view(token: string | undefined) {
    const id = this.parseToken(token);
    const a = await this.expireIfNeeded(await this.load(id));
    const ver = await this.quizzes.getVersion(a.quiz_id, a.quiz_version);
    const act = a.activity;
    const s = act.settings as any;
    const base = {
      attemptId: a.id, status: a.status as 'in_progress' | 'submitted', mode: act.mode, style: act.style, title: act.title, subject: ver.subject, instructions: ver.instructions,
      steps: s.steps ?? { wrong: 'stay' }, instantFeedback: !!s.instantFeedback && act.mode === 'solo',
      passMarkPercent: s.passMarkPercent ?? null, durationMinutes: s.durationMinutes ?? null,
      deadline: isoOrNull(a.deadline_at), serverNow: new Date().toISOString(), playerName: a.player_name,
      returnUrl: a.return_url, questionCount: ver.questions.length,
    };
    if (a.status === 'in_progress') {
      const locked: string[] = a.locked;
      const judged = this.judgeLocked(ver.questions, a, s);
      return { ...base, questions: ver.questions.map((q) => publicQuestion(q, a.id, this.env)), answers: a.answers, locked, judged };
    }
    return { ...base, result: this.visibleResult(a, ver.questions, act) };
  }

  /** Per-question feedback for answers the learner has already locked in (instant feedback mode only). */
  private judgeLocked(qs: StoredQuestion[], a: any, s: any) {
    const out: Record<string, { correct: boolean; correctId: string; explanation: string; stepFrom: number; stepTo: number }> = {};
    if (!a.locked.length) return out;
    const g = gradeAttempt(graded(qs), a.answers, s.steps ?? { wrong: 'stay' });
    for (const o of g.outcomes) {
      if (!a.locked.includes(o.id)) continue;
      const q = qs.find((x) => x.id === o.id)!;
      out[o.id] = { correct: o.correct, correctId: q.correctId, explanation: q.explanation, stepFrom: o.stepFrom, stepTo: o.stepTo };
    }
    return out;
  }

  private isReleased(a: any, act: any) {
    const s = act.settings as any;
    if (s.release === 'immediate' || !s.release) return true;
    if (s.release === 'after_close') return !!s.closesAt && Date.now() > new Date(s.closesAt).getTime();
    return !!a.released;
  }
  visibleResult(a: any, qs: StoredQuestion[], act: any) {
    const s = act.settings as any;
    const released = this.isReleased(a, act);
    const head = { submittedAt: isoOrNull(a.submitted_at), autoSubmitted: a.auto_submitted, released, style: a.style as 'points' | 'steps' };
    if (!released) return { ...head, message: s.release === 'after_close' ? 'Your answers are in. Results are released after the exam closes.' : 'Your answers are in. Your host will release the results.' };
    const outcomes: any[] = a.outcomes ?? [];
    return {
      ...head,
      marksEarned: Number(a.marks_earned), marksPossible: Number(a.marks_possible), percent: Number(a.percent),
      passMarkPercent: s.passMarkPercent ?? null, passed: a.passed,
      points: a.style === 'points' ? a.points : null, pointsPossible: a.style === 'points' ? qs.reduce((n, q) => n + q.points, 0) : null,
      stepPosition: a.style === 'steps' ? a.step_position : null, stepMax: qs.length,
      review: s.showAnswers === false ? null : qs.map((q) => {
        const o = outcomes.find((x) => x.id === q.id);
        return { id: q.id, text: q.text, image: imageView(this.env, q.image), options: q.options, chosen: o?.chosen ?? null, correctId: q.correctId, correct: !!o?.correct, marks: q.marks, earned: o?.marks ?? 0, explanation: q.explanation, stepTo: o?.stepTo };
      }),
    };
  }

  /** Autosave. Replaces the unlocked answers; the server decides what is acceptable. */
  async save(token: string | undefined, answers: Record<string, string | null>) {
    const id = this.parseToken(token);
    const a = await this.expireIfNeeded(await this.load(id));
    if (a.status === 'submitted') throw new HttpError(409, 'This attempt has already been submitted', 'submitted');
    const ver = await this.quizzes.getVersion(a.quiz_id, a.quiz_version);
    const merged: Record<string, string> = { ...a.answers };
    for (const q of ver.questions) {
      if (!(q.id in answers) || a.locked.includes(q.id)) continue;
      const v = answers[q.id];
      if (v == null) delete merged[q.id];
      else if (q.options.some((o) => o.id === v)) merged[q.id] = v;
    }
    await this.db.query("update attempts set answers=$2 where id=$1 and status='in_progress'", [id, JSON.stringify(merged)]);
    return { saved: true, answers: merged, savedAt: new Date().toISOString() };
  }

  /** Instant-feedback practice: answer once, get the verdict, the answer is locked. A repeat returns the same verdict. */
  async answerOne(token: string | undefined, questionId: string, optionId: string) {
    const id = this.parseToken(token);
    const a = await this.expireIfNeeded(await this.load(id));
    if (a.status === 'submitted') throw new HttpError(409, 'This attempt has already been submitted', 'submitted');
    const s = a.activity.settings as any;
    if (!(s.instantFeedback && a.activity.mode === 'solo')) throw new HttpError(422, 'Instant feedback is off for this quest', 'wrong_mode');
    const ver = await this.quizzes.getVersion(a.quiz_id, a.quiz_version);
    const q = ver.questions.find((x) => x.id === questionId);
    if (!q || !q.options.some((o) => o.id === optionId)) throw new HttpError(400, 'Unknown question or option', 'invalid');
    if (!a.locked.includes(questionId)) {
      // The WHERE clause makes the lock atomic: a double tap cannot record two different answers.
      await this.db.query(
        `update attempts set answers = answers || jsonb_build_object($2::text, $3::text), locked = locked || to_jsonb($2::text)
         where id=$1 and status='in_progress' and not (locked ? $2::text)`, [id, questionId, optionId]);
    }
    const fresh = await this.load(id);
    const judged = this.judgeLocked(ver.questions, fresh, s);
    return { judged: judged[questionId]!, answers: fresh.answers, locked: fresh.locked, judgedAll: judged };
  }

  async submit(token: string | undefined) {
    const id = this.parseToken(token);
    await this.submitInternal(id, false);
    return this.view(token);
  }

  /** Idempotent: only the call that flips in_progress -> submitted grades and enqueues the partner event. */
  async submitInternal(attemptId: string, auto: boolean) {
    const a = await this.load(attemptId);
    if (a.status === 'submitted') return;
    const ver = await this.quizzes.getVersion(a.quiz_id, a.quiz_version);
    const s = a.activity.settings as any;
    const g = gradeAttempt(graded(ver.questions), a.answers, s.steps ?? { wrong: 'stay' });
    const passed = hasPassed(g.percent, s.passMarkPercent ?? null);
    // A CBT attempt submitted late (the sweep) is stamped at its deadline, not at sweep time.
    const submittedAt = auto && a.deadline_at ? new Date(a.deadline_at) : new Date();
    const won = await this.db.tx(async (q) => {
      const r = await q.query(
        `update attempts set status='submitted', submitted_at=$2, auto_submitted=$3, marks_earned=$4, marks_possible=$5, percent=$6, points=$7, step_position=$8, passed=$9, outcomes=$10
         where id=$1 and status='in_progress'`,
        [attemptId, submittedAt, auto, g.marksEarned, g.marksPossible, g.percent, g.points, g.stepPosition, passed, JSON.stringify(g.outcomes)]);
      if (!r.rowCount) return false;
      if (a.partner_id) {
        const ev: ResultEvent = {
          eventId: `evt_${attemptId}`, type: 'attempt.submitted', partnerAssignmentRef: a.activity.assignment_ref, learnerRef: a.learner_ref,
          attemptId, quizId: a.quiz_id, quizVersion: a.quiz_version, activityType: a.activity.mode, style: a.style,
          marksEarned: g.marksEarned, marksPossible: g.marksPossible, percent: g.percent, passMarkPercent: s.passMarkPercent ?? null, passed,
          ...(a.style === 'points' ? { points: g.points, pointsPossible: g.pointsPossible } : { stepPosition: g.stepPosition, stepMax: g.stepMax }),
          submittedAt: submittedAt.toISOString(), autoSubmitted: auto,
        };
        await q.query('insert into webhook_deliveries(event_id,partner_id,attempt_id,payload) values ($1,$2,$3,$4) on conflict do nothing', [ev.eventId, a.partner_id, attemptId, JSON.stringify(ev)]);
      }
      return true;
    });
    if (won && a.partner_id) this.onSubmitted?.(attemptId);
  }

  // ---- teacher side ---------------------------------------------------------------------------------------------

  async listForActivity(activityId: string) {
    return many(this.db,
      `select id, player_name as "playerName", learner_ref as "learnerRef", (select i.name from invitations i where i.id=invitation_id) as "candidate",
              (select i.email from invitations i where i.id=invitation_id) as email,
              status, started_at as "startedAt", submitted_at as "submittedAt", auto_submitted as "autoSubmitted", marks_earned::float as "marksEarned", marks_possible::float as "marksPossible",
              percent::float as percent, points, step_position as "stepPosition", passed, released, quiz_version as "quizVersion"
       from attempts where activity_id=$1 order by started_at desc`, [activityId]);
  }
  async release(attemptId: string, activityId: string, released: boolean) {
    await this.db.query('update attempts set released=$3 where id=$1 and activity_id=$2', [attemptId, activityId, released]);
  }
  async releaseAll(activityId: string) {
    await this.db.query("update attempts set released=true where activity_id=$1 and status='submitted'", [activityId]);
  }
}
