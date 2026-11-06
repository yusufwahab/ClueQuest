import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, boot, sampleQuiz, teacher, type Harness } from './helpers';

let h: Harness;
let tk: string;
beforeAll(async () => { h = await boot(); tk = await teacher(h); });
afterAll(async () => { await h.close(); });

const soon = () => new Date(Date.now() + 3_600_000).toISOString();
const later = () => new Date(Date.now() + 7_200_000).toISOString();
const rules = { durationMinutes: 45, attemptLimit: 1, passMarkPercent: 50, release: 'manual', opensAt: soon(), closesAt: later() };

describe('exams are their own thing, not a quest', () => {
  it('keeps exam questions out of the quest list, and quest questions out of the exam list', async () => {
    const exam = await api(h, 'POST', '/quizzes?kind=exam', { token: tk, body: { ...sampleQuiz, title: 'Term exam' } });
    const quest = await api(h, 'POST', '/quizzes', { token: tk, body: { ...sampleQuiz, title: 'Practice quest' } });
    expect(exam.status).toBe(201);
    expect(exam.body.kind).toBe('exam');
    expect(quest.body.kind).toBe('quest');

    const quests = (await api(h, 'GET', '/quizzes', { token: tk })).body.quizzes.map((q: any) => q.title);
    const exams = (await api(h, 'GET', '/quizzes?kind=exam', { token: tk })).body.quizzes.map((q: any) => q.title);
    expect(quests).toContain('Practice quest');
    expect(quests).not.toContain('Term exam');
    expect(exams).toContain('Term exam');
    expect(exams).not.toContain('Practice quest');
  });

  it('creates an exam in one step: publishes the questions and opens a CBT with the rules', async () => {
    const draft = await api(h, 'POST', '/quizzes?kind=exam', { token: tk, body: { ...sampleQuiz, title: 'Physics exam' } });
    const listed = (await api(h, 'GET', '/quizzes?kind=exam', { token: tk })).body.quizzes.find((q: any) => q.id === draft.body.id);
    expect(listed.has_exam).toBe(false); // still a draft

    const made = await api(h, 'POST', '/exams', { token: tk, body: { quizId: draft.body.id, ...rules } });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ mode: 'cbt', title: 'Physics exam', quizVersion: 1, status: 'open' });
    expect(made.body.settings).toMatchObject({ durationMinutes: 45, attemptLimit: 1, passMarkPercent: 50, release: 'manual' });

    const after = (await api(h, 'GET', '/quizzes?kind=exam', { token: tk })).body.quizzes.find((q: any) => q.id === draft.body.id);
    expect(after.has_exam).toBe(true);
    expect((await api(h, 'POST', '/exams', { token: tk, body: { quizId: draft.body.id, ...rules } })).status).toBe(409); // not twice
  });

  it('refuses to turn a quest into an exam, a missing duration, a bad window and incomplete questions', async () => {
    const quest = await api(h, 'POST', '/quizzes', { token: tk, body: sampleQuiz });
    expect((await api(h, 'POST', '/exams', { token: tk, body: { quizId: quest.body.id, ...rules } })).status).toBe(422);

    const exam = await api(h, 'POST', '/quizzes?kind=exam', { token: tk, body: sampleQuiz });
    expect((await api(h, 'POST', '/exams', { token: tk, body: { quizId: exam.body.id, release: 'manual' } })).status).toBe(422); // no duration
    expect((await api(h, 'POST', '/exams', { token: tk, body: { quizId: exam.body.id, durationMinutes: 30, opensAt: later(), closesAt: soon() } })).status).toBe(422); // closes before it opens

    const blank = await api(h, 'POST', '/quizzes?kind=exam', { token: tk, body: { title: 'Empty', questions: [] } });
    expect((await api(h, 'POST', '/exams', { token: tk, body: { quizId: blank.body.id, ...rules } })).status).toBe(422); // nothing to ask
    expect((await api(h, 'POST', '/exams', { body: { quizId: exam.body.id, ...rules } })).status).toBe(401);
  });

  it('lets the host change the questions and rules until the first candidate starts, then locks the paper', async () => {
    const draft = await api(h, 'POST', '/quizzes?kind=exam', { token: tk, body: { ...sampleQuiz, title: 'Chemistry exam' } });
    const openNow = { ...rules, opensAt: null }; // already open, so a candidate can start straight away
    const made = (await api(h, 'POST', '/exams', { token: tk, body: { quizId: draft.body.id, ...openNow } })).body;

    // fix a question and the rules while nobody has started
    const edited = { ...sampleQuiz, title: 'Chemistry exam (final)', questions: sampleQuiz.questions.slice(0, 2) };
    expect((await api(h, 'PUT', `/quizzes/${draft.body.id}`, { token: tk, body: edited })).status).toBe(200);
    const updated = await api(h, 'PUT', `/exams/${made.id}`, { token: tk, body: { ...openNow, durationMinutes: 90 } });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ quizVersion: 2, title: 'Chemistry exam (final)' });
    expect(updated.body.settings.durationMinutes).toBe(90);

    // a candidate starts
    const inv = await api(h, 'POST', `/activities/${made.id}/invitations`, { token: tk, body: { invitees: [{ name: 'Bola', email: 'bola@school.test' }] } });
    const tokenPart = inv.body.invitations[0].url.split('/exam/')[1];
    const started = await api(h, 'POST', `/public/invite/${tokenPart}/start`, {});
    expect(started.status).toBe(201);

    const locked = await api(h, 'PUT', `/exams/${made.id}`, { token: tk, body: { ...openNow, durationMinutes: 10 } });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('exam_locked');
    expect((await api(h, 'GET', `/activities/${made.id}`, { token: tk })).body.settings.durationMinutes).toBe(90); // unchanged
  });

  it('only exams from the exam flow can be edited this way, and only by their owner', async () => {
    const quest = await api(h, 'POST', '/quizzes', { token: tk, body: sampleQuiz });
    await api(h, 'POST', `/quizzes/${quest.body.id}/publish`, { token: tk });
    const act = await api(h, 'POST', '/activities', { token: tk, body: { quizId: quest.body.id, mode: 'cbt', style: 'points', durationMinutes: 20 } });
    expect((await api(h, 'PUT', `/exams/${act.body.id}`, { token: tk, body: rules })).status).toBe(422);

    const other = await teacher(h);
    const draft = await api(h, 'POST', '/quizzes?kind=exam', { token: tk, body: sampleQuiz });
    const made = (await api(h, 'POST', '/exams', { token: tk, body: { quizId: draft.body.id, ...rules } })).body;
    expect((await api(h, 'PUT', `/exams/${made.id}`, { token: other, body: rules })).status).toBe(404);
  });
});

describe('a shareable exam link, alongside personal invitations', () => {
  const openNow = { durationMinutes: 30, release: 'manual', attemptLimit: 1, closesAt: new Date(Date.now() + 7_200_000).toISOString() };
  const examWith = async (settings: Record<string, unknown>) => {
    const draft = await api(h, 'POST', '/quizzes?kind=exam', { token: tk, body: { ...sampleQuiz, title: 'Link exam' } });
    return (await api(h, 'POST', '/exams', { token: tk, body: { quizId: draft.body.id, ...openNow, ...settings } })).body;
  };

  it('lets anyone with the link read its details and start after giving a name and an email or ID', async () => {
    const exam = await examWith({ access: 'link' });
    expect(exam.settings.access).toBe('link');
    const info = await api(h, 'GET', `/public/solo/${exam.shareCode}`);
    expect(info.status).toBe(200);
    expect(info.body).toMatchObject({ mode: 'cbt', access: 'link', durationMinutes: 30, title: 'Link exam' });

    expect((await api(h, 'POST', `/public/solo/${exam.shareCode}/start`, { body: {} })).body.error).toMatch(/full name/i); // asked for a name
    expect((await api(h, 'POST', `/public/solo/${exam.shareCode}/start`, { body: { name: 'Ngozi Eze' } })).body.error).toMatch(/email address or ID/i);

    const first = await api(h, 'POST', `/public/solo/${exam.shareCode}/start`, { body: { name: 'Ngozi Eze', candidateId: 'Ngozi@School.test' } });
    expect(first.status).toBe(201);
    const again = await api(h, 'POST', `/public/solo/${exam.shareCode}/start`, { body: { name: 'Ngozi Eze', candidateId: 'ngozi@school.test' } });
    expect(again.body.resumed).toBe(true); // same person, any capital letters: back to the same attempt
    expect(again.body.token).toBe(first.body.token);

    const view = await api(h, 'GET', '/attempts/me', { attempt: first.body.token });
    expect(view.body).toMatchObject({ mode: 'cbt', playerName: 'Ngozi Eze' });
    expect(view.body.deadline).toBeTruthy(); // the server-side clock runs as for any exam
  });

  it('counts attempts per person, and keeps different people separate', async () => {
    const exam = await examWith({ access: 'link', attemptLimit: 1 });
    const go = (name: string, id: string) => api(h, 'POST', `/public/solo/${exam.shareCode}/start`, { body: { name, candidateId: id } });
    const a = await go('Ada', 'ada@school.test');
    expect(a.status).toBe(201);
    expect((await go('Bola', 'bola@school.test')).status).toBe(201); // someone else is not blocked
    await api(h, 'POST', '/attempts/me/submit', { attempt: a.body.token });
    const blocked = await go('Ada', 'ada@school.test');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('attempt_limit');
  });

  it('stays closed when the host chose invitations only, and still works with invitations when the link is on', async () => {
    const closed = await examWith({ access: 'invited' });
    expect((await api(h, 'GET', `/public/solo/${closed.shareCode}`)).status).toBe(403);
    expect((await api(h, 'POST', `/public/solo/${closed.shareCode}/start`, { body: { name: 'Eli', candidateId: 'eli@school.test' } })).status).toBe(403);

    const both = await examWith({ access: 'link' });
    const inv = await api(h, 'POST', `/activities/${both.id}/invitations`, { token: tk, body: { invitees: [{ name: 'Bola', email: 'bola@school.test' }] } });
    expect(inv.status).toBe(201); // personal invitations still work on an exam that also has a shared link
    expect((await api(h, 'POST', `/public/invite/${inv.body.invitations[0].url.split('/exam/')[1]}/start`)).status).toBe(201);
  });

  it('does not open a plain exam made without the setting, and a closed exam rejects the link', async () => {
    const plain = await examWith({}); // the API default is invitations only
    expect((await api(h, 'GET', `/public/solo/${plain.shareCode}`)).status).toBe(403);
    const link = await examWith({ access: 'link' });
    await api(h, 'POST', `/activities/${link.id}/close`, { token: tk });
    expect((await api(h, 'POST', `/public/solo/${link.shareCode}/start`, { body: { name: 'Cy', candidateId: 'cy@school.test' } })).status).toBe(403);
  });
});
