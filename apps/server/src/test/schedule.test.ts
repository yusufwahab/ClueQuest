import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, ask, boot, connect, nextState, publishedQuiz, teacher, type Harness } from './helpers';

let h: Harness;
let tk: string;
beforeAll(async () => { h = await boot(); tk = await teacher(h); });
afterAll(async () => { await h.close(); });

const inMs = (ms: number) => new Date(Date.now() + ms).toISOString();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function activity(mode: 'solo' | 'live', extra: Record<string, unknown>) {
  const id = await publishedQuiz(h, tk);
  return api(h, 'POST', '/activities', { token: tk, body: { quizId: id, mode, style: 'steps', secondsPerQuestion: 30, ...extra } });
}

describe('scheduling a quest', () => {
  it('asks for a time when one is needed, and refuses a time that has passed', async () => {
    expect((await activity('solo', { startMode: 'manual' })).status).toBe(422);
    expect((await activity('live', { startMode: 'auto', startsAt: inMs(-3_600_000) })).status).toBe(422);
    const ok = await activity('solo', { startMode: 'instant' });
    expect(ok.status).toBe(201); // no time: starts at once, as before
  });

  it('a practice link that starts when the host opens it: visitors are told when, then it works', async () => {
    const startsAt = inMs(3_600_000);
    const a = await activity('solo', { startMode: 'manual', startsAt });
    const info = await api(h, 'GET', `/public/solo/${a.body.shareCode}`);
    expect(info.body.schedule).toMatchObject({ mode: 'manual', startsAt, open: false });
    const early = await api(h, 'POST', `/public/solo/${a.body.shareCode}/start`, { body: { name: 'Ada' } });
    expect(early.status).toBe(403);
    expect(early.body).toMatchObject({ code: 'not_started', details: { startsAt } });
    // the time passing changes nothing for a manual quest; the host's button does
    expect((await api(h, 'POST', `/activities/${a.body.id}/open-now`, { token: tk })).status).toBe(200);
    expect((await api(h, 'POST', `/public/solo/${a.body.shareCode}/start`, { body: { name: 'Ada' } })).status).toBe(201);
  });

  it('a practice link set to start automatically opens by itself at the time', async () => {
    const a = await activity('solo', { startMode: 'auto', startsAt: inMs(1500) });
    expect((await api(h, 'POST', `/public/solo/${a.body.shareCode}/start`, { body: { name: 'Ada' } })).status).toBe(403);
    await wait(1700);
    expect((await api(h, 'GET', `/public/solo/${a.body.shareCode}`)).body.schedule.open).toBe(true);
    expect((await api(h, 'POST', `/public/solo/${a.body.shareCode}/start`, { body: { name: 'Ada' } })).status).toBe(201);
  });

  it('the host can reschedule a practice link, or make it instant', async () => {
    const a = await activity('solo', { startMode: 'manual', startsAt: inMs(3_600_000) });
    expect((await api(h, 'PATCH', `/activities/${a.body.id}/schedule`, { token: tk, body: { startMode: 'auto' } })).status).toBe(422); // needs a time
    expect((await api(h, 'PATCH', `/activities/${a.body.id}/schedule`, { token: tk, body: { startMode: 'instant', startsAt: null } })).status).toBe(200);
    expect((await api(h, 'POST', `/public/solo/${a.body.shareCode}/start`, { body: { name: 'Ada' } })).status).toBe(201);
  });
});

describe('scheduling a live game', () => {
  it('keeps people out of the lobby until shortly before the time, and tells them when to come back', async () => {
    const startsAt = inMs(2 * 3_600_000);
    const a = await activity('live', { startMode: 'manual', startsAt });
    const room = (await api(h, 'POST', `/activities/${a.body.id}/rooms`, { token: tk })).body;
    const info = await api(h, 'GET', `/rooms/by-code/${room.code}`);
    expect(info.body.schedule).toMatchObject({ mode: 'manual', startsAt, canJoin: false });
    const early = await api(h, 'POST', `/rooms/by-code/${room.code}/join`, { body: { nickname: 'Ann' } });
    expect(early.status).toBe(403);
    expect(early.body).toMatchObject({ code: 'not_started', details: { startsAt } });

    // moved to a few minutes away: the lobby is open for early arrivals
    expect((await api(h, 'PATCH', `/activities/${a.body.id}/schedule`, { token: tk, body: { startMode: 'manual', startsAt: inMs(5 * 60_000) } })).status).toBe(200);
    const join = await api(h, 'POST', `/rooms/by-code/${room.code}/join`, { body: { nickname: 'Ann' } });
    expect(join.status).toBe(201);
    const ann = await connect(h, { code: room.code, token: join.body.token });
    const st = await nextState(ann, (s) => s.phase === 'lobby');
    expect(st.schedule).toMatchObject({ mode: 'manual', due: false });
    ann.close();
  });

  it('manual: still waits for the host after the time has passed', async () => {
    const a = await activity('live', { startMode: 'manual', startsAt: inMs(1200) });
    const room = (await api(h, 'POST', `/activities/${a.body.id}/rooms`, { token: tk })).body;
    const j = await api(h, 'POST', `/rooms/by-code/${room.code}/join`, { body: { nickname: 'Ann' } });
    const ann = await connect(h, { code: room.code, token: j.body.token });
    const host = await connect(h, { code: room.code, accessToken: tk });
    await wait(1700);
    await ask(ann, 'sync', {});
    const st = await nextState(ann, (s) => s.schedule.due === true);
    expect(st.phase).toBe('lobby'); // time reached, nobody pressed start
    expect((await ask(host, 'host', { cmd: 'start' })).ok).toBe(true);
    await nextState(ann, (s) => s.phase === 'question');
    ann.close(); host.close();
  });

  it('automatic: starts by itself at the time when players are there', async () => {
    const a = await activity('live', { startMode: 'auto', startsAt: inMs(1500) });
    const room = (await api(h, 'POST', `/activities/${a.body.id}/rooms`, { token: tk })).body;
    const j = await api(h, 'POST', `/rooms/by-code/${room.code}/join`, { body: { nickname: 'Ann' } });
    const ann = await connect(h, { code: room.code, token: j.body.token });
    await nextState(ann, (s) => s.phase === 'lobby');
    const started = await nextState(ann, (s) => s.phase === 'question', 6000); // nobody pressed anything
    expect(started.qIndex).toBe(0);
    ann.close();
  });

  it('automatic: with nobody there it waits, and the first player to arrive starts it', async () => {
    const a = await activity('live', { startMode: 'auto', startsAt: inMs(1000) });
    const room = (await api(h, 'POST', `/activities/${a.body.id}/rooms`, { token: tk })).body;
    await wait(1600);
    expect((await api(h, 'GET', `/rooms/by-code/${room.code}`)).body.phase).toBe('lobby');
    const j = await api(h, 'POST', `/rooms/by-code/${room.code}/join`, { body: { nickname: 'Late' } });
    const late = await connect(h, { code: room.code, token: j.body.token });
    await nextState(late, (s) => s.phase === 'question', 6000);
    late.close();
  });

  it('cannot be rescheduled once the game is running', async () => {
    const a = await activity('live', { startMode: 'manual', startsAt: inMs(60_000) });
    const room = (await api(h, 'POST', `/activities/${a.body.id}/rooms`, { token: tk })).body;
    const j = await api(h, 'POST', `/rooms/by-code/${room.code}/join`, { body: { nickname: 'Ann' } });
    const host = await connect(h, { code: room.code, accessToken: tk });
    await connect(h, { code: room.code, token: j.body.token });
    expect((await ask(host, 'host', { cmd: 'start' })).ok).toBe(true);
    const r = await api(h, 'PATCH', `/activities/${a.body.id}/schedule`, { token: tk, body: { startMode: 'instant', startsAt: null } });
    expect(r.status).toBe(409);
    host.close();
  });
});
