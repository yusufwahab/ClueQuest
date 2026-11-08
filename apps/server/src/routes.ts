import express, { Router, type Request } from 'express';
import { aiGenerateSchema, answerOneSchema, inviteSchema, joinRoomSchema, loginSchema, registerSchema, saveAnswersSchema, startAttemptSchema } from '@cluequest/contracts';
import { isValidRoomCode, normaliseRoomCode, scheduleState } from '@cluequest/game-core';
import type { Ctx } from './ctx';
import { HttpError, csvSafe, many, one } from './db/util';
import { isoOrNull } from './attempts';
import { IMAGE_TYPES, MAX_IMAGE_BYTES } from './images';

const attemptToken = (req: Request) => (typeof req.headers['x-attempt-token'] === 'string' ? req.headers['x-attempt-token'] : undefined);
const id = (req: Request, k = 'id') => String(req.params[k]);

const brief = (a: any, extra: Record<string, unknown> = {}) => {
  const s = a.settings as any;
  const sc = scheduleState(s, Date.now());
  return {
    schedule: { mode: sc.mode, startsAt: sc.startsAt, open: sc.open, serverNow: Date.now() },
    title: a.title, mode: a.mode, style: a.style, status: a.status, quizVersion: a.quiz_version,
    steps: s.steps, access: s.access ?? 'invited', passMarkPercent: s.passMarkPercent ?? null, attemptLimit: s.attemptLimit ?? null,
    durationMinutes: s.durationMinutes ?? null, opensAt: s.opensAt ?? null, closesAt: s.closesAt ?? null, instantFeedback: !!s.instantFeedback,
    ...extra,
  };
};

export function routes(ctx: Ctx) {
  const r = Router();
  const { auth, quizzes, attempts, live, partners, db, limit, ai, env, images } = ctx;
  const teacher = auth.require();
  const uid = (req: Request) => req.user!.id;

  // ---- accounts (teachers and hosts only) ----------------------------------------------------------------------------
  r.post('/auth/register', limit('register', 10, 3_600_000), async (req, res) => {
    const b = registerSchema.parse(req.body);
    res.status(201).json(await auth.register(b.email, b.password, b.displayName));
  });
  r.post('/auth/login', limit('login', 20, 600_000), async (req, res) => {
    const b = loginSchema.parse(req.body);
    res.json(await auth.login(b.email, b.password));
  });
  r.get('/me', teacher, (req, res) => res.json({ user: req.user }));

  // ---- teacher: quizzes -------------------------------------------------------------------------------------------------
  const kindOf = (req: Request) => (req.query.kind === 'exam' ? 'exam' : 'quest');
  r.get('/quizzes', teacher, async (req, res) => res.json({ quizzes: await quizzes.list(uid(req), kindOf(req)) }));
  r.post('/quizzes', teacher, async (req, res) => res.status(201).json(await quizzes.create(uid(req), req.body, kindOf(req))));
  r.get('/quizzes/:id', teacher, async (req, res) => res.json(await quizzes.get(id(req), uid(req))));
  r.put('/quizzes/:id', teacher, async (req, res) => res.json(await quizzes.saveDraft(id(req), uid(req), req.body)));
  r.post('/quizzes/:id/publish', teacher, async (req, res) => res.json(await quizzes.publish(id(req), uid(req))));
  r.post('/quizzes/:id/archive', teacher, async (req, res) => { await quizzes.archive(id(req), uid(req)); res.status(204).end(); });
  r.put('/quizzes/:id/partner-access', teacher, async (req, res) => { await quizzes.setPartnerAccess(id(req), uid(req), !!req.body?.allow); res.status(204).end(); });

  // ---- question images -----------------------------------------------------------------------------------------------
  // Upload is for hosts. Reading is public by an unguessable id, because learners need to see the pictures in a published quest.
  r.post('/images', teacher, limit('img', 120, 3_600_000, (req) => req.user!.id), express.raw({ type: [...IMAGE_TYPES], limit: MAX_IMAGE_BYTES }), async (req, res) => {
    if (!Buffer.isBuffer(req.body)) throw new HttpError(415, 'Use a PNG, JPEG, WebP or GIF picture.', 'bad_image');
    res.status(201).json(await images.save(uid(req), req.body));
  });
  r.get('/images/:id', async (req, res) => {
    const img = await images.get(id(req));
    if (!img) throw new HttpError(404, 'Image not found', 'not_found');
    res.set({ 'content-type': img.mime, 'content-length': String(img.bytes.length), 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" });
    res.end(img.bytes);
  });

  // ---- AI assistant (hosts only; one request builds a whole draft, so credit use stays small) ----------------------------
  r.get('/ai/status', teacher, (_req, res) => res.json({ enabled: ai.enabled }));
  r.post('/ai/quest', teacher, limit('ai', env.AI_DAILY_LIMIT, 86_400_000, (req) => req.user!.id), async (req, res) => {
    res.json(await ai.generate(uid(req), aiGenerateSchema.parse(req.body)));
  });

  // ---- teacher: activities (a configured use of a published quiz) ---------------------------------------------------
  r.get('/activities', teacher, async (req, res) => res.json({ activities: await quizzes.listActivities(uid(req)) }));
  // ---- exams (their own questions; independent of quests) -------------------------------------------------------------------
  r.post('/exams', teacher, async (req, res) => {
    const { quizId, ...settings } = req.body ?? {};
    if (typeof quizId !== 'string') throw new HttpError(400, 'Choose the exam questions first', 'invalid');
    res.status(201).json(await quizzes.createExam(uid(req), quizId, settings));
  });
  r.put('/exams/:id', teacher, async (req, res) => res.json(await quizzes.updateExam(uid(req), id(req), req.body ?? {})));
  r.post('/activities', teacher, async (req, res) => res.status(201).json(await quizzes.createActivity(uid(req), req.body)));
  r.get('/activities/:id', teacher, async (req, res) => {
    const a = await quizzes.ownActivity(id(req), uid(req));
    res.json({ ...quizzes.shape(a), attempts: await attempts.listForActivity(a.id), invitations: a.mode === 'cbt' ? await quizzes.invitations(a.id, uid(req)) : [] });
  });
  r.patch('/activities/:id/schedule', teacher, async (req, res) => {
    const a = await quizzes.setSchedule(id(req), uid(req), req.body);
    await live.rearmActivity(a.id);
    res.json(a);
  });
  r.post('/activities/:id/open-now', teacher, async (req, res) => res.json(await quizzes.openNow(id(req), uid(req))));
  r.post('/activities/:id/close', teacher, async (req, res) => { await quizzes.setActivityStatus(id(req), uid(req), 'closed'); res.status(204).end(); });
  r.post('/activities/:id/reopen', teacher, async (req, res) => { await quizzes.setActivityStatus(id(req), uid(req), 'open'); res.status(204).end(); });
  r.post('/activities/:id/invitations', teacher, async (req, res) => {
    const b = inviteSchema.parse(req.body);
    res.status(201).json({ invitations: await quizzes.invite(id(req), uid(req), b.invitees) });
  });
  r.post('/activities/:id/release', teacher, async (req, res) => {
    const a = await quizzes.ownActivity(id(req), uid(req));
    await attempts.releaseAll(a.id); res.status(204).end();
  });
  r.get('/activities/:id/results.csv', teacher, async (req, res) => {
    const a = await quizzes.ownActivity(id(req), uid(req));
    const rows = await attempts.listForActivity(a.id);
    const head = ['Name', 'Email / ref', 'Status', 'Quest version', 'Marks', 'Out of', 'Percent', 'Passed', 'Points', 'Step', 'Submitted'];
    const lines = [head.map(csvSafe).join(',')];
    for (const x of rows as any[]) lines.push([x.candidate ?? x.playerName ?? '', x.email ?? x.learnerRef ?? '', x.status, x.quizVersion, x.marksEarned ?? '', x.marksPossible ?? '', x.percent ?? '', x.passed ?? '', x.points ?? '', x.stepPosition ?? '', isoOrNull(x.submittedAt) ?? ''].map(csvSafe).join(','));
    res.type('text/csv').attachment(`${a.title.replace(/[^\w-]+/g, '_')}-results.csv`).send(lines.join('\r\n'));
  });
  r.post('/activities/:id/attempts/:attemptId/release', teacher, async (req, res) => {
    const a = await quizzes.ownActivity(id(req), uid(req));
    await attempts.release(id(req, 'attemptId'), a.id, req.body?.released !== false); res.status(204).end();
  });

  // ---- teacher: results overview ---------------------------------------------------------------------------------------
  r.get('/results', teacher, async (req, res) => {
    const acts = await quizzes.listActivities(uid(req));
    res.json({ activities: acts, rooms: await live.hostResults(uid(req)) });
  });
  r.get('/rooms/:roomId/results', teacher, async (req, res) => res.json(await live.roomResults(id(req, 'roomId'), uid(req))));
  r.post('/activities/:id/rooms', teacher, async (req, res) => res.status(201).json(await live.createRoom(uid(req), id(req))));

  // ---- public: settings the website needs (never anything secret) --------------------------------------------------------
  r.get('/public/config', limit('pub', 120, 60_000), (_req, res) => res.json({ whatsappLink: env.WHATSAPP_LINK ?? null }));

  // ---- public: solo link --------------------------------------------------------------------------------------------------
  r.get('/public/solo/:code', limit('pub', 120, 60_000), async (req, res) => {
    const a = await quizzes.activityByShareCode(id(req, 'code'));
    if (a.mode === 'live') throw new HttpError(422, 'This is a live game. Join it with a room code.', 'wrong_mode');
    if (a.mode === 'cbt' && (a.settings as any).access !== 'link') throw new HttpError(403, 'This exam needs your personal invitation link', 'needs_identity');
    const v = await quizzes.getVersion(a.quiz_id, a.quiz_version);
    res.json(brief(a, { subject: v.subject, instructions: v.instructions, questionCount: v.questions.length }));
  });
  r.post('/public/solo/:code/start', limit('start', 60, 60_000), async (req, res) => {
    const a = await quizzes.activityByShareCode(id(req, 'code'));
    const b = startAttemptSchema.parse(req.body ?? {});
    if (a.mode === 'cbt') {
      if ((a.settings as any).access !== 'link') throw new HttpError(403, 'This exam needs your personal invitation link', 'needs_identity');
      // An open-link exam: the name and email or ID the candidate types identify them, so they can resume and attempts can be counted.
      const name = (b.name ?? '').trim(), ref = (b.candidateId ?? '').trim().toLowerCase();
      if (!name) throw new HttpError(400, 'Enter your full name', 'invalid');
      if (ref.length < 3) throw new HttpError(400, 'Enter your email address or ID number', 'invalid');
      return void res.status(201).json(await attempts.start(a, { name, learnerRef: ref }));
    }
    res.status(201).json(await attempts.start(a, { name: b.name }));
  });

  // ---- public: CBT invitation ---------------------------------------------------------------------------------------------
  const inviteInfo = async (token: string) => {
    const inv = await quizzes.invitationByToken(token);
    const a = inv.activity;
    const v = await quizzes.getVersion(a.quiz_id, a.quiz_version);
    const open = await one<any>(db, "select id from attempts where invitation_id=$1 and status='in_progress'", [inv.id]);
    const used = await one<any>(db, 'select count(*)::int as n from attempts where invitation_id=$1', [inv.id]);
    const done = await many<any>(db, "select id from attempts where invitation_id=$1 and status='submitted' order by started_at desc limit 1", [inv.id]);
    return { inv, a, v, open, used: used.n, done: done[0] };
  };
  r.get('/public/invite/:token', limit('pub', 120, 60_000), async (req, res) => {
    const { inv, a, v, open, used, done } = await inviteInfo(id(req, 'token'));
    const s = a.settings as any;
    res.json(brief(a, {
      subject: v.subject, instructions: v.instructions, questionCount: v.questions.length, candidateName: inv.name,
      attemptsUsed: used, hasOpenAttempt: !!open, canStart: !!open || s.attemptLimit == null || used < s.attemptLimit,
      lastAttemptToken: done ? attempts.tokenFor(done.id) : null,
    }));
  });
  r.post('/public/invite/:token/start', limit('start', 60, 60_000), async (req, res) => {
    const { inv, a } = await inviteInfo(id(req, 'token'));
    res.status(201).json(await attempts.start(a, { invitationId: inv.id, name: inv.name }));
  });
  // A finished candidate can return to their result (when the release rules allow it).
  r.get('/public/invite/:token/latest', limit('pub', 120, 60_000), async (req, res) => {
    const { inv, done } = await inviteInfo(id(req, 'token'));
    if (!done) throw new HttpError(404, 'No submitted attempt yet', 'not_found');
    res.json({ token: attempts.tokenFor(done.id), name: inv.name });
  });

  // ---- public: partner launch ------------------------------------------------------------------------------------------
  const launchInfo = async (token: string) => {
    const { launch, activity } = await partners.launchByToken(token);
    const v = await quizzes.getVersion(activity.quiz_id, activity.quiz_version);
    const ident = `l:${launch.learner_ref}`;
    const open = await one<any>(db, "select id from attempts where activity_id=$1 and identity_key=$2 and status='in_progress'", [activity.id, ident]);
    const used = await one<any>(db, 'select count(*)::int as n from attempts where activity_id=$1 and identity_key=$2', [activity.id, ident]);
    const last = await one<any>(db, "select id from attempts where activity_id=$1 and identity_key=$2 and status='submitted' order by started_at desc limit 1", [activity.id, ident]);
    return { launch, activity, v, open, used: used.n, last };
  };
  r.get('/launch/:token', limit('pub', 120, 60_000), async (req, res) => {
    const { launch, activity, v, open, used, last } = await launchInfo(id(req, 'token'));
    const s = activity.settings as any;
    res.json(brief(activity, {
      subject: v.subject, instructions: v.instructions, questionCount: v.questions.length, learnerName: launch.learner_name, returnUrl: launch.return_url,
      attemptsUsed: used, hasOpenAttempt: !!open, canStart: !!open || s.attemptLimit == null || used < s.attemptLimit,
      lastAttemptToken: last ? attempts.tokenFor(last.id) : null,
    }));
  });
  // Opening the link never consumes an attempt; only this explicit start does, and it resumes an open attempt instead of adding one.
  r.post('/launch/:token/start', limit('start', 60, 60_000), async (req, res) => {
    const { launch, activity } = await launchInfo(id(req, 'token'));
    res.status(201).json(await attempts.start(activity, { learnerRef: launch.learner_ref, name: launch.learner_name ?? undefined, partnerId: launch.partner_id, returnUrl: launch.return_url }));
  });

  // ---- attempts (any holder of the attempt token) ----------------------------------------------------------------------
  r.get('/attempts/me', async (req, res) => res.json(await attempts.view(attemptToken(req))));
  r.put('/attempts/me/answers', limit('save', 600, 60_000, (q) => attemptToken(q) ?? q.ip ?? 'x'), async (req, res) => {
    const b = saveAnswersSchema.parse(req.body);
    res.json(await attempts.save(attemptToken(req), b.answers));
  });
  r.post('/attempts/me/answer', async (req, res) => {
    const b = answerOneSchema.parse(req.body);
    res.json(await attempts.answerOne(attemptToken(req), b.questionId, b.optionId));
  });
  r.post('/attempts/me/submit', async (req, res) => res.json(await attempts.submit(attemptToken(req))));

  // ---- live rooms --------------------------------------------------------------------------------------------------------
  r.get('/rooms/by-code/:code', limit('room', 60, 60_000), async (req, res) => {
    const code = normaliseRoomCode(id(req, 'code'));
    if (!isValidRoomCode(code)) throw new HttpError(400, 'Room codes have 6 digits', 'invalid');
    res.json(await live.preview(code));
  });
  r.post('/rooms/by-code/:code/join', limit('join', 60, 60_000), async (req, res) => {
    const code = normaliseRoomCode(id(req, 'code'));
    if (!isValidRoomCode(code)) throw new HttpError(400, 'Room codes have 6 digits', 'invalid');
    const b = joinRoomSchema.parse(req.body);
    const j = await live.join(code, b.nickname, b.resumeToken, b.avatar);
    res.status(j.resumed ? 200 : 201).json({ token: j.token, nickname: j.nickname, resumed: j.resumed, code });
  });

  // ---- partner API v1 --------------------------------------------------------------------------------------------------
  const p = Router();
  p.use(partners.authenticate());
  p.get('/quizzes/:id', async (req, res) => res.json(await partners.lookup(id(req))));
  p.post('/launches', async (req, res) => res.status(201).json(await partners.launch(req.partner!, req.body)));
  p.get('/attempts/:id/result', async (req, res) => res.json(await partners.attemptForPartner(req.partner!, id(req))));
  r.use('/partner/v1', p);

  return r;
}
