import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, ask, boot, connect, nextState, publishedQuiz, teacher, type Harness } from './helpers';

let h: Harness;
let tk: string;
beforeAll(async () => { h = await boot(); tk = await teacher(h); });
afterAll(async () => { await h.close(); });

async function room(style: 'points' | 'steps' = 'steps') {
  const id = await publishedQuiz(h, tk);
  const act = await api(h, 'POST', '/activities', { token: tk, body: { quizId: id, mode: 'live', style, secondsPerQuestion: 30 } });
  return (await api(h, 'POST', `/activities/${act.body.id}/rooms`, { token: tk })).body as { code: string };
}
const look = { color: 3, face: 2, hat: 4, extra: 1 };

describe('avatars', () => {
  it('keeps the look a player chose, gives everyone one, and lets a player change it', async () => {
    const r = await room();
    const a = await api(h, 'POST', `/rooms/by-code/${r.code}/join`, { body: { nickname: 'Ann', avatar: look } });
    const b = await api(h, 'POST', `/rooms/by-code/${r.code}/join`, { body: { nickname: 'Ben' } }); // no look chosen
    const bad = await api(h, 'POST', `/rooms/by-code/${r.code}/join`, { body: { nickname: 'Cy', avatar: { color: 99, face: 0, hat: 0, extra: 0 } } });
    expect(bad.status).toBe(400);

    const ann = await connect(h, { code: r.code, token: a.body.token });
    const st = await nextState(ann, (s) => s.players.length === 2);
    expect(st.players.find((p: any) => p.nickname === 'Ann').avatar).toEqual(look);
    expect(st.players.find((p: any) => p.nickname === 'Ben').avatar).toMatchObject({ color: expect.any(Number), face: expect.any(Number) });
    expect(st.board.find((p: any) => p.nickname === 'Ann').avatar).toEqual(look);

    const next = { color: 0, face: 7, hat: 0, extra: 5 };
    expect((await ask(ann, 'avatar', { avatar: next })).ok).toBe(true);
    expect((await ask(ann, 'avatar', { avatar: { color: -1 } })).ok).toBe(false);
    const after = await nextState(ann, (s) => s.players.find((p: any) => p.nickname === 'Ann')?.avatar.face === 7);
    expect(after.players.find((p: any) => p.nickname === 'Ann').avatar).toEqual(next);
    expect(b.status).toBe(201);
    ann.close();
  });
});

describe('room chat and reactions', () => {
  it('lets everyone chat in the lobby and between questions, filters messages, rate-limits, and the host can switch it off', async () => {
    const r = await room();
    const a = await api(h, 'POST', `/rooms/by-code/${r.code}/join`, { body: { nickname: 'Ann' } });
    const b = await api(h, 'POST', `/rooms/by-code/${r.code}/join`, { body: { nickname: 'Ben' } });
    const host = await connect(h, { code: r.code, accessToken: tk });
    const ann = await connect(h, { code: r.code, token: a.body.token });
    const ben = await connect(h, { code: r.code, token: b.body.token });

    const heard = new Promise<any>((res) => ben.once('chat', res));
    const sent = await ask(ann, 'say', { kind: 'chat', body: 'Good luck everyone!' });
    expect(sent).toMatchObject({ ok: true, data: { nickname: 'Ann', host: false, body: 'Good luck everyone!' } });
    expect(await heard).toMatchObject({ nickname: 'Ann', body: 'Good luck everyone!' });

    // too fast, then links and rude words are refused with a reason
    expect((await ask(ann, 'say', { kind: 'chat', body: 'again' })).code).toBe('rate_limited');
    expect((await ask(ben, 'say', { kind: 'chat', body: 'visit www.example.com now' })).code).toBe('bad_message');
    await new Promise((res) => setTimeout(res, 1300));
    expect((await ask(ann, 'say', { kind: 'chat', body: 'you are a bitch' })).code).toBe('bad_message');

    // reactions come from a fixed set
    const react = new Promise<any>((res) => host.once('reaction', res));
    expect((await ask(ben, 'say', { kind: 'reaction', body: 'fire' })).ok).toBe(true);
    expect(await react).toMatchObject({ nickname: 'Ben', reaction: 'fire' });
    expect((await ask(ben, 'say', { kind: 'reaction', body: '<script>' })).code).toBe('invalid');

    // a reconnecting player sees the recent chat
    const fresh = await connect(h, { code: r.code, token: a.body.token });
    const st = await nextState(fresh, (s) => s.chat.length >= 1);
    expect(st.chat[0]).toMatchObject({ nickname: 'Ann', body: 'Good luck everyone!' });
    fresh.close();

    // host turns chat off: players are told, the host can still speak
    expect((await ask(host, 'host', { cmd: 'chat', on: false })).ok).toBe(true);
    await new Promise((res) => setTimeout(res, 1300));
    expect((await ask(ben, 'say', { kind: 'chat', body: 'hello' })).code).toBe('chat_off');
    expect((await ask(host, 'say', { kind: 'chat', body: 'Quiet please, we start soon' })).data).toMatchObject({ nickname: 'Host', host: true });
    expect((await ask(ann, 'host', { cmd: 'chat', on: true })).ok).toBe(false); // players cannot

    // nobody chats while a question is open (only the host can)
    expect((await ask(host, 'host', { cmd: 'chat', on: true })).ok).toBe(true);
    expect((await ask(host, 'host', { cmd: 'start' })).ok).toBe(true);
    await nextState(ben, (s) => s.phase === 'question');
    await new Promise((res) => setTimeout(res, 1300));
    expect((await ask(ben, 'say', { kind: 'chat', body: 'psst, the answer is B' })).code).toBe('bad_phase');
    for (const s of [host, ann, ben]) s.close();
  });
});

describe('players see what the host sees', () => {
  it('shares the roster with answered flags, the full standings and the answer counts', async () => {
    const r = await room('points');
    const a = await api(h, 'POST', `/rooms/by-code/${r.code}/join`, { body: { nickname: 'Ann' } });
    const b = await api(h, 'POST', `/rooms/by-code/${r.code}/join`, { body: { nickname: 'Ben' } });
    const host = await connect(h, { code: r.code, accessToken: tk });
    const ann = await connect(h, { code: r.code, token: a.body.token });
    const ben = await connect(h, { code: r.code, token: b.body.token });
    await ask(host, 'host', { cmd: 'start' });
    await nextState(ann, (s) => s.phase === 'question');
    await ask(ann, 'answer', { questionId: 'q1', optionId: 'o1' });
    const mid = await nextState(ben, (s) => s.answered === 1);
    expect(mid.players.map((p: any) => [p.nickname, p.answered]).sort()).toEqual([['Ann', true], ['Ben', false]]);
    await ask(ben, 'answer', { questionId: 'q1', optionId: 'o2' });
    await ask(host, 'host', { cmd: 'lock' });
    const locked = await nextState(ben, (s) => s.phase === 'locked');
    expect(locked.standings).toHaveLength(2); // everyone, not just a top ten
    expect(locked.question.counts).toEqual({ o1: 1, o2: 1 });
    expect(locked.standings[0]).toMatchObject({ nickname: 'Ann', rank: 1 });
    expect(locked.standings[0].avatar).toBeTruthy();
    for (const s of [host, ann, ben]) s.close();
  });
});

describe('a game that has ended', () => {
  it('says so plainly, with the quest title, instead of "no open game"', async () => {
    const r = await room();
    const host = await connect(h, { code: r.code, accessToken: tk });
    expect((await ask(host, 'host', { cmd: 'end' })).ok).toBe(true); // cancelled from the lobby
    const info = await api(h, 'GET', `/rooms/by-code/${r.code}`);
    expect(info.status).toBe(410);
    expect(info.body).toMatchObject({ code: 'ended', error: 'This game was cancelled by the host.', details: { phase: 'cancelled' } });
    expect(info.body.details.title).toBeTruthy();
    const join = await api(h, 'POST', `/rooms/by-code/${r.code}/join`, { body: { nickname: 'Late' } });
    expect(join.status).toBe(410);
    expect((await api(h, 'GET', '/rooms/by-code/000000')).status).toBe(404); // a code that never existed
    host.close();
  });
});
