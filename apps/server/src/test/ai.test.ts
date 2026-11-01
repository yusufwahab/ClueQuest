import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validatePublishable } from '@cluequest/contracts';
import { shapeDraft } from '../ai';
import { api, boot, teacher, type Harness } from './helpers';

let h: Harness;
let tk: string;
beforeAll(async () => { h = await boot({ AI_MOCK: 'true' }); tk = await teacher(h); });
afterAll(async () => { await h.close(); });

describe('AI assistant', () => {
  it('turns a short form into a draft that can be saved and published', async () => {
    expect((await api(h, 'GET', '/ai/status', { token: tk })).body).toEqual({ enabled: true });
    const r = await api(h, 'POST', '/ai/quest', { token: tk, body: { topic: 'Python loops', count: 6, difficulty: 'mixed', optionCount: 4, explanations: true } });
    expect(r.status).toBe(200);
    expect(r.body.questions).toHaveLength(6);
    expect(r.body.title).toContain('Python loops');
    expect(new Set(r.body.questions.map((q: any) => q.points))).toEqual(new Set([50, 100, 200])); // points follow difficulty
    expect(validatePublishable(r.body)).toEqual([]);
    const saved = await api(h, 'POST', '/quizzes', { token: tk, body: { title: r.body.title, subject: r.body.subject, instructions: r.body.instructions, questions: r.body.questions } });
    expect(saved.status).toBe(201);
    expect((await api(h, 'POST', `/quizzes/${saved.body.id}/publish`, { token: tk })).status).toBe(200);
  });

  it('is hosts-only and validates the form', async () => {
    expect((await api(h, 'POST', '/ai/quest', { body: { topic: 'Anything' } })).status).toBe(401);
    expect((await api(h, 'POST', '/ai/quest', { token: tk, body: { topic: 'x' } })).status).toBe(400);
    expect((await api(h, 'POST', '/ai/quest', { token: tk, body: { topic: 'Valid topic', count: 99 } })).status).toBe(400);
  });

  it('reports the assistant as off when no provider is configured', async () => {
    const off = await boot();
    try {
      const t = await teacher(off);
      expect((await api(off, 'GET', '/ai/status', { token: t })).body).toEqual({ enabled: false });
      expect((await api(off, 'POST', '/ai/quest', { token: t, body: { topic: 'History of Rome' } })).status).toBe(503);
    } finally { await off.close(); }
  });
});

describe('shapeDraft', () => {
  const input = { topic: 't', notes: '', count: 5, difficulty: 'mixed' as const, level: '', language: 'English', optionCount: 4, explanations: false };
  it('drops broken, duplicate and repeated questions and keeps the right answer after shuffling', () => {
    const d = shapeDraft({
      title: ' T ', subject: '', instructions: '',
      questions: [
        { text: 'Good?', options: ['a', 'b', 'c', 'd'], correctIndex: 2 },
        { text: 'good?', options: ['a', 'b'], correctIndex: 0 },            // repeated text
        { text: 'No key', options: ['a', 'b'], correctIndex: 5 },           // answer index out of range
        { text: 'Same options', options: ['a', 'A'], correctIndex: 0 },     // duplicate options
        { text: 'One option', options: ['a'], correctIndex: 0 },
      ],
    }, input);
    expect(d.questions).toHaveLength(1);
    expect(d.skipped).toBe(4);
    const q = d.questions[0]!;
    expect(q.options.find((o) => o.id === q.correctId)!.text).toBe('c');
  });
});
