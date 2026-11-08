import { randomBytes, randomInt } from 'node:crypto';
import { draftSchema, activitySchema, scheduleSchema, validatePublishable, type ActivityInput, type Question } from '@cluequest/contracts';
import type { Db } from './db/db';
import { HttpError, many, one, sha256 } from './db/util';
import type { Env } from './env';
import type { Mailer } from './email';
import { invitationEmail } from './email';
import { imageView } from './images';

export interface StoredQuestion extends Question {}
export interface VersionRow { quiz_id: string; version: number; title: string; subject: string; instructions: string; questions: StoredQuestion[] }

const shareCode = () => randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x').slice(0, 8);

/** Normalise a possibly-incomplete draft question so the editor always gets every field. */
function fillQuestion(q: any): StoredQuestion {
  return { id: String(q.id), text: q.text ?? '', options: q.options ?? [], correctId: q.correctId ?? '', marks: q.marks ?? 1, points: q.points ?? 100, explanation: q.explanation ?? '', image: q.image ?? null };
}

export class QuizService {
  constructor(private db: Db, private env: Env, private mailer: Mailer) {}

  async list(ownerId: string, kind: 'quest' | 'exam' = 'quest') {
    return many(this.db, `select id,title,subject,status,latest_version,allow_partners,updated_at,kind,jsonb_array_length(draft->'questions') as question_count,
        exists(select 1 from activities a where a.quiz_id=quizzes.id and a.mode='cbt') as has_exam
      from quizzes where owner_id=$1 and kind=$2 and status <> 'archived' order by updated_at desc`, [ownerId, kind]);
  }
  async create(ownerId: string, input: unknown, kind: 'quest' | 'exam' = 'quest') {
    const d = draftSchema.parse(input ?? { title: 'Untitled quiz' });
    const draft = { instructions: d.instructions, play: d.play, questions: d.questions.map(fillQuestion) };
    const r = await one<any>(this.db, 'insert into quizzes(owner_id,title,subject,draft,kind) values ($1,$2,$3,$4,$5) returning id', [ownerId, d.title, d.subject, JSON.stringify(draft), kind]);
    return this.get(r.id, ownerId);
  }
  async mustOwn(id: string, ownerId: string) {
    const q = await one<any>(this.db, 'select * from quizzes where id=$1', [id]);
    if (!q || q.owner_id !== ownerId) throw new HttpError(404, 'Quiz not found', 'not_found');
    return q;
  }
  async get(id: string, ownerId: string) {
    const q = await this.mustOwn(id, ownerId);
    const versions = await many(this.db, 'select version, published_at from quiz_versions where quiz_id=$1 order by version desc', [id]);
    return { id: q.id, kind: q.kind as 'quest' | 'exam', title: q.title, subject: q.subject, instructions: q.draft.instructions ?? '', play: q.draft.play ?? null, questions: (q.draft.questions ?? []).map((x: any) => ({ ...x, image: imageView(this.env, x.image) })), status: q.status, latestVersion: q.latest_version, allowPartners: q.allow_partners, versions, updatedAt: q.updated_at };
  }
  async saveDraft(id: string, ownerId: string, input: unknown) {
    await this.mustOwn(id, ownerId);
    const d = draftSchema.parse(input);
    const draft = { instructions: d.instructions, play: d.play, questions: d.questions.map(fillQuestion) };
    await this.db.query('update quizzes set title=$2, subject=$3, draft=$4, updated_at=now() where id=$1', [id, d.title, d.subject, JSON.stringify(draft)]);
    return this.get(id, ownerId);
  }
  async setPartnerAccess(id: string, ownerId: string, allow: boolean) {
    await this.mustOwn(id, ownerId);
    await this.db.query('update quizzes set allow_partners=$2 where id=$1', [id, allow]);
  }
  async archive(id: string, ownerId: string) {
    await this.mustOwn(id, ownerId);
    await this.db.query("update quizzes set status='archived', updated_at=now() where id=$1", [id]);
  }
  /** Publishing freezes the current draft (questions, answer key, marks, points) as a new immutable version. */
  async publish(id: string, ownerId: string) {
    const q = await this.mustOwn(id, ownerId);
    const questions = (q.draft.questions ?? []).map(fillQuestion);
    const problems = validatePublishable({ title: q.title, questions });
    if (problems.length) throw new HttpError(422, problems[0]!, 'not_publishable', { problems });
    const version = await this.db.tx(async (tx) => {
      const cur = await one<any>(tx, 'select latest_version from quizzes where id=$1 for update', [id]);
      const v = (cur?.latest_version ?? 0) + 1;
      await tx.query('insert into quiz_versions(quiz_id,version,title,subject,instructions,questions) values ($1,$2,$3,$4,$5,$6)', [id, v, q.title, q.subject, q.draft.instructions ?? '', JSON.stringify(questions)]);
      await tx.query("update quizzes set latest_version=$2, status='published', updated_at=now() where id=$1", [id, v]);
      return v;
    });
    return { version };
  }

  async getVersion(quizId: string, version: number): Promise<VersionRow> {
    const v = await one<VersionRow>(this.db, 'select quiz_id,version,title,subject,instructions,questions from quiz_versions where quiz_id=$1 and version=$2', [quizId, version]);
    if (!v) throw new HttpError(404, 'Quiz version not found', 'not_found');
    return v;
  }

  // ---- activities -------------------------------------------------------------------------------------------

  async createActivity(ownerId: string, raw: unknown) {
    const a = activitySchema.parse(raw);
    const quiz = await this.mustOwn(a.quizId, ownerId);
    if (!quiz.latest_version) throw new HttpError(422, 'Publish the quiz before using it', 'not_published');
    this.assertSettings(a);
    const ver = await this.getVersion(quiz.id, quiz.latest_version);
    return this.insertActivity({ ownerId, quizId: quiz.id, version: ver.version, mode: a.mode, style: a.style, title: a.title || ver.title, settings: this.settingsOf(a) });
  }
  /** A scheduled start needs a time in the future (a minute of slack for a slow click). Instant has no time. */
  assertSchedule(mode: string, a: { startMode?: string; startsAt?: string | null }, checkFuture = true) {
    if (mode === 'cbt') return;
    if (!a.startMode || a.startMode === 'instant') return;
    if (!a.startsAt) throw new HttpError(422, 'Choose the date and time it starts', 'bad_schedule');
    if (checkFuture && Date.parse(a.startsAt) < Date.now() - 60_000) throw new HttpError(422, 'The start time has already passed. Choose a time in the future.', 'bad_schedule');
  }
  assertSettings(a: { mode: string; opensAt?: string | null; closesAt?: string | null; durationMinutes?: number | null; startMode?: string; startsAt?: string | null }) {
    this.assertSchedule(a.mode, a);
    if (a.opensAt && a.closesAt && new Date(a.opensAt) >= new Date(a.closesAt)) throw new HttpError(422, 'The exam must close after it opens', 'bad_window');
    if (a.mode === 'cbt' && !a.durationMinutes) throw new HttpError(422, 'Set an exam duration', 'bad_duration');
  }
  settingsOf(a: ReturnType<typeof activitySchema.parse>) {
    const { quizId: _q, mode: _m, style: _s, title: _t, ...settings } = a;
    return settings;
  }
  async insertActivity(p: { ownerId: string | null; quizId: string; version: number; mode: string; style: string; title: string; settings: unknown; partnerId?: string; assignmentRef?: string }) {
    for (let i = 0; i < 5; i++) {
      try {
        const r = await one<any>(this.db,
          `insert into activities(owner_id,quiz_id,quiz_version,mode,style,title,settings,share_code,partner_id,assignment_ref)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
          [p.ownerId, p.quizId, p.version, p.mode, p.style, p.title, JSON.stringify(p.settings), shareCode(), p.partnerId ?? null, p.assignmentRef ?? null]);
        return this.shape(r);
      } catch (e) { if (!/share_code/.test(String((e as Error).message))) throw e; }
    }
    throw new Error('Could not allocate a share code');
  }
  shape(r: any) {
    return { id: r.id, quizId: r.quiz_id, quizVersion: r.quiz_version, mode: r.mode, style: r.style, title: r.title, settings: r.settings, shareCode: r.share_code, status: r.status, partnerId: r.partner_id, assignmentRef: r.assignment_ref, createdAt: r.created_at };
  }
  /** Change when a solo or live quest starts. A live quest whose game has begun, or a CBT, cannot be rescheduled. */
  async setSchedule(id: string, ownerId: string, raw: unknown) {
    const b = scheduleSchema.parse(raw);
    const a = await this.ownActivity(id, ownerId);
    if (a.mode === 'cbt') throw new HttpError(422, 'A CBT has its own opening and closing times', 'wrong_mode');
    if (a.mode === 'live') {
      const started = await one<any>(this.db, "select 1 from rooms where activity_id=$1 and phase not in ('lobby','cancelled','finished') limit 1", [id]);
      if (started) throw new HttpError(409, 'A game is already running, so it can no longer be rescheduled', 'already_started');
    }
    this.assertSchedule(a.mode, b);
    const next = { ...(a.settings as any), startMode: b.startMode, startsAt: b.startMode === 'instant' ? null : b.startsAt, startedAt: null };
    await this.db.query('update activities set settings=$2 where id=$1', [id, JSON.stringify(next)]);
    return this.shape({ ...a, settings: next });
  }
  /** Solo, host starts it by hand: from now on the link works. */
  async openNow(id: string, ownerId: string) {
    const a = await this.ownActivity(id, ownerId);
    if (a.mode !== 'solo') throw new HttpError(422, 'Only a practice link is opened this way. A live game starts from its room.', 'wrong_mode');
    const next = { ...(a.settings as any), startedAt: new Date().toISOString() };
    await this.db.query('update activities set settings=$2 where id=$1', [id, JSON.stringify(next)]);
    return this.shape({ ...a, settings: next });
  }
  async activityById(id: string) {
    const r = await one<any>(this.db, 'select * from activities where id=$1', [id]);
    if (!r) throw new HttpError(404, 'Activity not found', 'not_found');
    return r;
  }
  async ownActivity(id: string, ownerId: string) {
    const r = await this.activityById(id);
    if (r.owner_id !== ownerId) throw new HttpError(404, 'Activity not found', 'not_found');
    return r;
  }
  async activityByShareCode(code: string) {
    const r = await one<any>(this.db, 'select * from activities where share_code=$1', [code]);
    if (!r) throw new HttpError(404, 'This quiz link is not valid', 'not_found');
    return r;
  }
  async listActivities(ownerId: string) {
    return many(this.db, `select a.id,a.title,a.mode,a.style,a.status,a.share_code as "shareCode",a.quiz_version as "quizVersion",a.created_at as "createdAt",
        (select count(*)::int from attempts t where t.activity_id=a.id and t.status='submitted') as submitted,
        (select count(*)::int from attempts t where t.activity_id=a.id and t.status='in_progress') as "inProgress",
        (select count(*)::int from rooms r where r.activity_id=a.id) as rooms,
        (select count(*)::int from invitations i where i.activity_id=a.id) as invited,
        a.settings->>'startMode' as "startMode", a.settings->>'startsAt' as "startsAt", a.settings->>'startedAt' as "startedAt",
        a.settings->>'opensAt' as "opensAt", a.settings->>'closesAt' as "closesAt", (a.settings->>'durationMinutes')::int as "durationMinutes",
        (a.settings->>'attemptLimit')::int as "attemptLimit", coalesce(a.settings->>'access','invited') as access
      from activities a where a.owner_id=$1 order by a.created_at desc`, [ownerId]);
  }
  // ---- exams: their own question set, written in the exam flow, locked once a candidate starts --------------------------------------

  private examActivity(quizId: string, raw: unknown) {
    const a = activitySchema.parse({ ...(raw as object), quizId, mode: 'cbt', style: 'points' });
    this.assertSettings(a);
    return a;
  }
  /** Publish the exam's questions and open the exam, in one step. The questions must belong to an exam, not a quest. */
  async createExam(ownerId: string, quizId: string, raw: unknown) {
    const quiz = await this.mustOwn(quizId, ownerId);
    if (quiz.kind !== 'exam') throw new HttpError(422, 'These questions belong to a quest, not an exam', 'not_exam');
    if (await one(this.db, "select 1 from activities where quiz_id=$1 and mode='cbt'", [quizId])) throw new HttpError(409, 'This exam has already been created', 'exists');
    const a = this.examActivity(quizId, raw);
    const { version } = await this.publish(quizId, ownerId);
    const ver = await this.getVersion(quizId, version);
    return this.insertActivity({ ownerId, quizId, version, mode: 'cbt', style: 'points', title: a.title || ver.title, settings: this.settingsOf(a) });
  }
  /** Change an exam's questions and rules. Only until the first candidate starts: after that the paper must not change. */
  async updateExam(ownerId: string, activityId: string, raw: unknown) {
    const act = await this.ownActivity(activityId, ownerId);
    const quiz = await this.mustOwn(act.quiz_id, ownerId);
    if (act.mode !== 'cbt' || quiz.kind !== 'exam') throw new HttpError(422, 'Only exams created in the exam flow can be edited here', 'not_exam');
    const started = await one<{ n: number }>(this.db, 'select count(*)::int as n from attempts where activity_id=$1', [activityId]);
    if (started && started.n > 0) throw new HttpError(409, 'Candidates have already started this exam, so its questions and rules are locked.', 'exam_locked');
    const a = this.examActivity(quiz.id, raw);
    const { version } = await this.publish(quiz.id, ownerId);
    const ver = await this.getVersion(quiz.id, version);
    const r = await one<any>(this.db, 'update activities set quiz_version=$2, title=$3, settings=$4 where id=$1 returning *', [activityId, version, a.title || ver.title, JSON.stringify(this.settingsOf(a))]);
    return this.shape(r);
  }

  async setActivityStatus(id: string, ownerId: string, status: 'open' | 'closed') {
    await this.ownActivity(id, ownerId);
    await this.db.query('update activities set status=$2 where id=$1', [id, status]);
  }

  async invite(activityId: string, ownerId: string, invitees: { name: string; email: string }[]) {
    const a = await this.ownActivity(activityId, ownerId);
    if (a.mode !== 'cbt') throw new HttpError(422, 'Invitations are for exams', 'wrong_mode');
    const out: { name: string; email: string; url: string; emailStatus: string }[] = [];
    for (const i of invitees) {
      const token = randomBytes(24).toString('base64url');
      await this.db.query(
        `insert into invitations(activity_id,name,email,token_hash) values ($1,$2,lower($3),$4)
         on conflict (activity_id,email) do update set token_hash=excluded.token_hash, name=excluded.name`, [activityId, i.name, i.email, sha256(token)]);
      const url = `${this.env.PUBLIC_WEB_URL}/exam/${token}`;
      const s = a.settings as any;
      const sent = await this.mailer.send(invitationEmail({ to: i.email, name: i.name, quizTitle: a.title, url, opensAt: s.opensAt, closesAt: s.closesAt }));
      out.push({ name: i.name, email: i.email, url, emailStatus: sent.status });
    }
    return out;
  }
  async invitationByToken(token: string) {
    const r = await one<any>(this.db, 'select i.*, row_to_json(a.*) as activity from invitations i join activities a on a.id=i.activity_id where i.token_hash=$1', [sha256(token)]);
    if (!r) throw new HttpError(404, 'This invitation link is not valid', 'not_found');
    return r;
  }
  async invitations(activityId: string, ownerId: string) {
    await this.ownActivity(activityId, ownerId);
    return many(this.db, `select i.id,i.name,i.email,
      (select count(*)::int from attempts t where t.invitation_id=i.id) as attempts,
      (select max(t.status) from attempts t where t.invitation_id=i.id) as status from invitations i where activity_id=$1 order by name`, [activityId]);
  }

  static randomRoomCode() { return String(randomInt(0, 1_000_000)).padStart(6, '0'); }
}

export type { ActivityInput };
