import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signWebhook } from '../partners';
import { api, ask, boot, connect, fakePartner, nextState, publishedQuiz, teacher, type Harness } from './helpers';

let h: Harness;
let tk: string;
beforeAll(async () => { h = await boot(); tk = await teacher(h); });
afterAll(async () => { await h.close(); });

describe('authoring', () => {
  it('rejects publishing an incomplete quiz and keeps published versions immutable', async () => {
    const bad = await api(h, 'POST', '/quizzes', { token: tk, body: { title: 'Empty' } });
    expect((await api(h, 'POST', `/quizzes/${bad.body.id}/publish`, { token: tk })).status).toBe(422);

    const id = await publishedQuiz(h, tk);
    const act = await api(h, 'POST', '/activities', { token: tk, body: { quizId: id, mode: 'solo', style: 'points' } });
    expect(act.body.quizVersion).toBe(1);
    // Edit the draft (change the key) and publish v2; the existing activity stays on v1.
    const cur = (await api(h, 'GET', `/quizzes/${id}`, { token: tk })).body;
    cur.questions[0].correctId = 'o2';
    await api(h, 'PUT', `/quizzes/${id}`, { token: tk, body: cur });
    expect((await api(h, 'POST', `/quizzes/${id}/publish`, { token: tk })).body.version).toBe(2);
    const s = await api(h, 'POST', `/public/solo/${act.body.shareCode}/start`, { body: {} });
    const view = await api(h, 'GET', '/attempts/me', { attempt: s.body.token });
    expect(view.body.questions).toHaveLength(3);
    expect(JSON.stringify(view.body)).not.toContain('correctId');
    await api(h, 'PUT', '/attempts/me/answers', { attempt: s.body.token, body: { answers: { q1: 'o1' } } });
    const done = await api(h, 'POST', '/attempts/me/submit', { attempt: s.body.token });
    expect(done.body.result.marksEarned).toBe(1); // graded against v1 (o1 correct), not the new key
  });
});

describe('same quiz, Points and Steps', () => {
  it('keeps marks, points and steps separate and passes on marks only', async () => {
    const id = await publishedQuiz(h, tk);
    const pts = await api(h, 'POST', '/activities', { token: tk, body: { quizId: id, mode: 'solo', style: 'points', passMarkPercent: 50 } });
    const stp = await api(h, 'POST', '/activities', { token: tk, body: { quizId: id, mode: 'solo', style: 'steps', steps: { wrong: 'down' }, passMarkPercent: 50 } });
    const play = async (code: string, answers: Record<string, string>) => {
      const s = await api(h, 'POST', `/public/solo/${code}/start`, { body: { name: 'Ada' } });
      await api(h, 'PUT', '/attempts/me/answers', { attempt: s.body.token, body: { answers } });
      return (await api(h, 'POST', '/attempts/me/submit', { attempt: s.body.token })).body.result;
    };
    // q3 only (3 of 6 marks = 50%) => passes; points 300; steps: wrong,wrong,right => 1
    const a = { q3: 'o1' };
    const rp = await play(pts.body.shareCode, a);
    expect(rp).toMatchObject({ marksEarned: 3, marksPossible: 6, percent: 50, passed: true, points: 300, stepPosition: null });
    const rs = await play(stp.body.shareCode, a);
    expect(rs).toMatchObject({ marksEarned: 3, passed: true, stepPosition: 1, points: null });
    // wrong then right under "down": q1 right, q2 wrong, q3 wrong => 1,0,0
    const r2 = await play(stp.body.shareCode, { q1: 'o1', q2: 'o2', q3: 'o3' });
    expect(r2.stepPosition).toBe(0);
    expect(r2.marksEarned).toBe(1);
    expect(r2.passed).toBe(false);
  });

  it('instant feedback locks an answer and repeats the same verdict', async () => {
    const id = await publishedQuiz(h, tk);
    const act = await api(h, 'POST', '/activities', { token: tk, body: { quizId: id, mode: 'solo', style: 'steps', instantFeedback: true } });
    const s = await api(h, 'POST', `/public/solo/${act.body.shareCode}/start`, { body: {} });
    const a1 = await api(h, 'POST', '/attempts/me/answer', { attempt: s.body.token, body: { questionId: 'q1', optionId: 'o1' } });
    expect(a1.body.judged).toMatchObject({ correct: true, stepTo: 1 });
    const a2 = await api(h, 'POST', '/attempts/me/answer', { attempt: s.body.token, body: { questionId: 'q1', optionId: 'o2' } });
    expect(a2.body.judged).toMatchObject({ correct: true, stepTo: 1 });
    const done = await api(h, 'POST', '/attempts/me/submit', { attempt: s.body.token });
    expect(done.body.result.marksEarned).toBe(1);
  });
});

describe('CBT', () => {
  it('needs an invitation, enforces attempts, autosaves, and submits at the server deadline', async () => {
    const id = await publishedQuiz(h, tk);
    const act = await api(h, 'POST', '/activities', { token: tk, body: { quizId: id, mode: 'cbt', style: 'points', durationMinutes: 1, attemptLimit: 1, passMarkPercent: 40 } });
    expect((await api(h, 'GET', `/public/solo/${act.body.shareCode}`)).status).toBe(403);
    const inv = await api(h, 'POST', `/activities/${act.body.id}/invitations`, { token: tk, body: { invitees: [{ name: 'Bola', email: 'bola@school.test' }] } });
    const token = inv.body.invitations[0].url.split('/exam/')[1];
    const s1 = await api(h, 'POST', `/public/invite/${token}/start`);
    const s2 = await api(h, 'POST', `/public/invite/${token}/start`);
    expect(s2.body.token).toBe(s1.body.token); // double click resumes, no second attempt
    expect(s2.body.resumed).toBe(true);
    await api(h, 'PUT', '/attempts/me/answers', { attempt: s1.body.token, body: { answers: { q1: 'o1' } } });
    // "refresh": a fresh read returns the saved answer and the server deadline
    const view = await api(h, 'GET', '/attempts/me', { attempt: s1.body.token });
    expect(view.body.answers).toEqual({ q1: 'o1' });
    expect(view.body.deadline).toBeTruthy();
    // Force the deadline into the past: the server must auto-submit with the saved answer.
    await h.app.db.query("update attempts set deadline_at = now() - interval '10 seconds' where id = $1", [s1.body.attemptId]);
    const late = await api(h, 'PUT', '/attempts/me/answers', { attempt: s1.body.token, body: { answers: { q2: 'o1', q3: 'o1' } } });
    expect(late.status).toBe(409);
    const after = await api(h, 'GET', '/attempts/me', { attempt: s1.body.token });
    expect(after.body.status).toBe('submitted');
    expect(after.body.result).toMatchObject({ marksEarned: 1, autoSubmitted: true });
    const again = await api(h, 'POST', `/public/invite/${token}/start`);
    expect(again.status).toBe(403);
    expect(again.body.code).toBe('attempt_limit');
  });

  it('honours the availability window and hides results until released', async () => {
    const id = await publishedQuiz(h, tk);
    const future = new Date(Date.now() + 3600_000).toISOString();
    const closed = await api(h, 'POST', '/activities', { token: tk, body: { quizId: id, mode: 'cbt', style: 'points', durationMinutes: 10, opensAt: future } });
    const i1 = await api(h, 'POST', `/activities/${closed.body.id}/invitations`, { token: tk, body: { invitees: [{ name: 'C', email: 'c@x.test' }] } });
    const r = await api(h, 'POST', `/public/invite/${i1.body.invitations[0].url.split('/exam/')[1]}/start`);
    expect(r.body.code).toBe('not_open');

    const act = await api(h, 'POST', '/activities', { token: tk, body: { quizId: id, mode: 'cbt', style: 'points', durationMinutes: 10, release: 'manual' } });
    const i2 = await api(h, 'POST', `/activities/${act.body.id}/invitations`, { token: tk, body: { invitees: [{ name: 'D', email: 'd@x.test' }] } });
    const s = await api(h, 'POST', `/public/invite/${i2.body.invitations[0].url.split('/exam/')[1]}/start`);
    await api(h, 'PUT', '/attempts/me/answers', { attempt: s.body.token, body: { answers: { q1: 'o1' } } });
    const done = await api(h, 'POST', '/attempts/me/submit', { attempt: s.body.token });
    expect(done.body.result.released).toBe(false);
    expect(done.body.result.marksEarned).toBeUndefined();
    await api(h, 'POST', `/activities/${act.body.id}/release`, { token: tk });
    expect((await api(h, 'GET', '/attempts/me', { attempt: s.body.token })).body.result.marksEarned).toBe(1);
  });
});

describe('partner integration', () => {
  it('looks up, launches idempotently, delivers one signed result despite retries', async () => {
    const partner = await fakePartner(2); // first two deliveries fail
    const created = await h.app.ctx.partners.create({ slug: 'p1', name: 'P1', webhookUrl: partner.url, returnOrigins: ['http://class.test'] });
    const id = await publishedQuiz(h, tk);
    expect((await api(h, 'GET', `/partner/v1/quizzes/${id}`, { partnerKey: created.apiKey })).status).toBe(404); // not opted in
    await api(h, 'PUT', `/quizzes/${id}/partner-access`, { token: tk, body: { allow: true } });
    expect((await api(h, 'GET', `/partner/v1/quizzes/${id}`, { partnerKey: 'nope' })).status).toBe(401);
    const info = await api(h, 'GET', `/partner/v1/quizzes/${id}`, { partnerKey: created.apiKey });
    expect(info.body).toMatchObject({ published: true, version: 1, title: 'Fractions' });

    const body = { quizId: id, assignmentRef: 'asg-1', learnerRef: 'stu-9', returnUrl: 'http://class.test/back', activity: { type: 'solo', style: 'steps', steps: { wrong: 'stay' }, passMarkPercent: 50, attemptLimit: 1 } };
    const bad = await api(h, 'POST', '/partner/v1/launches', { partnerKey: created.apiKey, body: { ...body, returnUrl: 'http://evil.test/x' } });
    expect(bad.status).toBe(422);
    const l1 = await api(h, 'POST', '/partner/v1/launches', { partnerKey: created.apiKey, body });
    const l2 = await api(h, 'POST', '/partner/v1/launches', { partnerKey: created.apiKey, body });
    expect(l1.body.launchUrl).toMatch(/^http:\/\/web\.test\/launch\//);
    expect(l2.body.launchUrl).not.toBe(l1.body.launchUrl);
    const t1 = l1.body.launchUrl.split('/launch/')[1]; const t2 = l2.body.launchUrl.split('/launch/')[1];

    // Repeated clicks: viewing the link twice and starting twice yields one attempt.
    await api(h, 'GET', `/launch/${t1}`); await api(h, 'GET', `/launch/${t1}`);
    const a1 = await api(h, 'POST', `/launch/${t1}/start`);
    const a2 = await api(h, 'POST', `/launch/${t2}/start`);
    expect(a2.body.token).toBe(a1.body.token);
    const count = await h.app.db.query('select count(*)::int as n from attempts where learner_ref = $1', ['stu-9']);
    expect(count.rows[0].n).toBe(1);

    await api(h, 'PUT', '/attempts/me/answers', { attempt: a1.body.token, body: { answers: { q1: 'o1', q3: 'o1' } } });
    const [s1, s2] = await Promise.all([api(h, 'POST', '/attempts/me/submit', { attempt: a1.body.token }), api(h, 'POST', '/attempts/me/submit', { attempt: a1.body.token })]);
    expect(s1.status).toBe(200); expect(s2.status).toBe(200);
    expect(s1.body.returnUrl).toBe('http://class.test/back');

    // Wait for retries (2 failures, then success), then no further deliveries.
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && !(await h.app.db.query("select 1 from webhook_deliveries where status='delivered'")).rowCount) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 1500));
    expect(partner.received.length).toBe(3);
    const ids = new Set(partner.received.map((r) => r.headers['x-cluequest-event-id']));
    expect(ids.size).toBe(1); // the same logical event every time
    const last = partner.received[2]!;
    const ts = String(last.headers['x-cluequest-timestamp']);
    expect(last.headers['x-cluequest-signature']).toBe(signWebhook(created.webhookSecret, ts, last.body));
    const ev = JSON.parse(last.body);
    expect(ev).toMatchObject({ type: 'attempt.submitted', partnerAssignmentRef: 'asg-1', learnerRef: 'stu-9', quizVersion: 1, marksEarned: 4, marksPossible: 6, passed: true, style: 'steps', stepPosition: 2, autoSubmitted: false });
    expect(ev.points).toBeUndefined();
    const total = await h.app.db.query('select count(*)::int as n from webhook_deliveries');
    expect(total.rows[0].n).toBe(1);
    // Attempt limit holds on later launches.
    expect((await api(h, 'POST', `/launch/${t1}/start`)).body.code).toBe('attempt_limit');
    await partner.close();
  });
});

describe('live', () => {
  it('runs rounds, scores once, and a reconnect cannot score twice', async () => {
    const id = await publishedQuiz(h, tk);
    const act = await api(h, 'POST', '/activities', { token: tk, body: { quizId: id, mode: 'live', style: 'steps', steps: { wrong: 'down' }, secondsPerQuestion: 30 } });
    const room = (await api(h, 'POST', `/activities/${act.body.id}/rooms`, { token: tk })).body;
    const j1 = await api(h, 'POST', `/rooms/by-code/${room.code}/join`, { body: { nickname: 'Ann' } });
    const j2 = await api(h, 'POST', `/rooms/by-code/${room.code}/join`, { body: { nickname: 'Ben' } });
    expect(j1.status).toBe(201);
    const rejoin = await api(h, 'POST', `/rooms/by-code/${room.code}/join`, { body: { nickname: 'Whoever', resumeToken: j1.body.token } });
    expect(rejoin.body).toMatchObject({ resumed: true, nickname: 'Ann', token: j1.body.token });

    const host = await connect(h, { code: room.code, accessToken: tk });
    let ann = await connect(h, { code: room.code, token: j1.body.token });
    const ben = await connect(h, { code: room.code, token: j2.body.token });
    expect((await ask(host, 'host', { cmd: 'start' })).ok).toBe(true);
    const st = await nextState(ann, (s) => s.phase === 'question' && s.qIndex === 0);
    expect(JSON.stringify(st)).not.toContain('correctId');
    const first = await ask(ann, 'answer', { questionId: 'q1', optionId: 'o1' });
    expect(first.data).toMatchObject({ optionId: 'o1' });
    // Disconnect and reconnect with the same token, then try to change the answer.
    ann.close();
    ann = await connect(h, { code: room.code, token: j1.body.token });
    const again = await ask(ann, 'answer', { questionId: 'q1', optionId: 'o2' });
    expect(again.data.optionId).toBe('o1'); // original stands
    await ask(ben, 'answer', { questionId: 'q1', optionId: 'o2' });
    expect((await ask(host, 'host', { cmd: 'lock' })).ok).toBe(true);
    const locked = await nextState(ann, (s) => s.phase === 'locked');
    expect(locked.me).toMatchObject({ step: 1, marks: 1, points: 100, rank: 1 });
    expect(locked.question.correctId).toBe('o1');
    const late = await ask(ben, 'answer', { questionId: 'q1', optionId: 'o1' });
    expect(late.data.optionId).toBe('o2'); // the stored answer stands; a late change is ignored
    // Remaining rounds: Ann right twice, Ben wrong.
    for (const q of ['q2', 'q3']) {
      await ask(host, 'host', { cmd: 'next' });
      await nextState(ann, (s) => s.phase === 'question' && s.question.id === q);
      await ask(ann, 'answer', { questionId: q, optionId: 'o1' });
      await ask(ben, 'answer', { questionId: q, optionId: 'o2' });
      await ask(host, 'host', { cmd: 'lock' });
    }
    await ask(host, 'host', { cmd: 'next' });
    const fin = await nextState(ann, (s) => s.phase === 'finished');
    expect(fin.finalStandings.map((r: any) => [r.nickname, r.rank, r.step, r.marks])).toEqual([['Ann', 1, 3, 6], ['Ben', 2, 0, 0]]);
    // Every player (not only the top 10) sees everyone's step for the shared staircase.
    expect(fin.board.map((r: any) => [r.nickname, r.step]).sort()).toEqual([['Ann', 3], ['Ben', 0]]);
    const saved = await api(h, 'GET', `/rooms/${room.id}/results`, { token: tk });
    expect(saved.body.results).toHaveLength(2);
    expect(saved.body.results[0]).toMatchObject({ nickname: 'Ann', step: 3, marks: 6 });
    for (const s of [host, ann, ben]) s.close();
  });

  it('locks the question at the deadline without the host', async () => {
    const id = await publishedQuiz(h, tk);
    const act = await api(h, 'POST', '/activities', { token: tk, body: { quizId: id, mode: 'live', style: 'points', secondsPerQuestion: 5 } });
    const room = (await api(h, 'POST', `/activities/${act.body.id}/rooms`, { token: tk })).body;
    const j = await api(h, 'POST', `/rooms/by-code/${room.code}/join`, { body: { nickname: 'Cy' } });
    const host = await connect(h, { code: room.code, accessToken: tk });
    await ask(host, 'host', { cmd: 'start' });
    await h.app.db.query("update rooms set deadline = now() - interval '1 second' where id = $1", [room.id]);
    h.app.ctx.live.recover(); // re-arms the timer from the stored deadline
    const st = await nextState(host, (s) => s.phase === 'locked', 3000);
    expect(st.players[0].nickname).toBe('Cy');
    expect(j.status).toBe(201);
    host.close();
  });
});
