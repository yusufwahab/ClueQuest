import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, boot, publishedQuiz, teacher, type Harness } from './helpers';

const EMAIL = 'boss@cluequest.test', PASSWORD = 'a-strong-admin-pass-1';
let h: Harness;
let host: string;
beforeAll(async () => { h = await boot({ SUPER_ADMIN_EMAIL: EMAIL, SUPER_ADMIN_PASSWORD: PASSWORD }); host = await teacher(h); });
afterAll(async () => { await h.close(); });

const adminToken = async () => (await api(h, 'POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } })).body.token as string;

describe('super admin', () => {
  it('signs in with the values from the settings, as an admin', async () => {
    const r = await api(h, 'POST', '/auth/login', { body: { email: EMAIL, password: PASSWORD } });
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ email: EMAIL, role: 'admin' });
    expect((await api(h, 'POST', '/auth/login', { body: { email: EMAIL, password: 'wrong-password-123' } })).status).toBe(401);
    // nobody can register that email to take it over
    expect((await api(h, 'POST', '/auth/register', { body: { email: EMAIL.toUpperCase(), password: 'another-long-pass-1', displayName: 'Imposter' } })).status).toBe(409);
  });

  it('keeps the analytics for admins only', async () => {
    expect((await api(h, 'GET', '/admin/analytics')).status).toBe(401);
    expect((await api(h, 'GET', '/admin/analytics', { token: host })).status).toBe(403);
    expect((await api(h, 'GET', '/admin/hosts', { token: host })).status).toBe(403);
    expect((await api(h, 'GET', '/admin/analytics', { token: await adminToken() })).status).toBe(200);
  });

  it('counts what hosts and players actually did', async () => {
    const id = await publishedQuiz(h, host);
    const live = await api(h, 'POST', '/activities', { token: host, body: { quizId: id, mode: 'live', style: 'steps' } });
    const room = (await api(h, 'POST', `/activities/${live.body.id}/rooms`, { token: host })).body;
    await api(h, 'POST', `/rooms/by-code/${room.code}/join`, { body: { nickname: 'Ann' } });
    await api(h, 'POST', `/rooms/by-code/${room.code}/join`, { body: { nickname: 'Ben' } });
    const solo = await api(h, 'POST', '/activities', { token: host, body: { quizId: id, mode: 'solo', style: 'points' } });
    const s = await api(h, 'POST', `/public/solo/${solo.body.shareCode}/start`, { body: { name: 'Ada' } });
    await api(h, 'POST', '/attempts/me/submit', { attempt: s.body.token });

    const a = (await api(h, 'GET', '/admin/analytics', { token: await adminToken() })).body;
    expect(a.hosts.total).toBeGreaterThanOrEqual(1);
    expect(a.hosts.new7).toBeGreaterThanOrEqual(1);
    expect(a.hosts.active7).toBeGreaterThanOrEqual(1);
    expect(a.live).toMatchObject({ rooms: 1, players: 2, playersNow: 2, inProgress: 1, biggest: 2 });
    expect(a.content).toMatchObject({ live: 1, solo: 1 });
    expect(a.practice).toMatchObject({ started: 1, submitted: 1, completionRate: 100 });
    expect(a.trend).toHaveLength(30);
    expect(a.trend.at(-1)).toMatchObject({ games: 1, players: 2, attempts: 1 });
    expect(a.topHosts[0]).toMatchObject({ games: 1, players: 2, attempts: 1 });
    // the admin account itself is not counted as a host, and no player names or answers appear
    expect(a.hosts.total).toBe(1);
    expect(JSON.stringify(a)).not.toMatch(/Ann|Ben|Ada/);
  });

  it('lists hosts, with search', async () => {
    const t = await adminToken();
    const all = (await api(h, 'GET', '/admin/hosts', { token: t })).body;
    expect(all.total).toBe(1);
    expect(all.hosts[0]).toMatchObject({ games: 1, players: 2, quizzes: 1 });
    expect((await api(h, 'GET', `/admin/hosts?search=${encodeURIComponent('nobody-here')}`, { token: t })).body.total).toBe(0);
    expect((await api(h, 'GET', `/admin/hosts?search=${encodeURIComponent(all.hosts[0].email.slice(0, 4))}`, { token: t })).body.total).toBe(1);
  });
});

describe('super admin settings', () => {
  it('need both values, and a long enough password', async () => {
    await expect(boot({ SUPER_ADMIN_EMAIL: 'x@y.test' })).rejects.toThrow(/set together/);
    await expect(boot({ SUPER_ADMIN_EMAIL: 'x@y.test', SUPER_ADMIN_PASSWORD: 'short' })).rejects.toThrow(/at least 8/);
  });
  it('make only that one account an admin', async () => {
    const t = await adminToken();
    expect((await api(h, 'GET', '/me', { token: t })).body.user.role).toBe('admin');
    expect((await api(h, 'GET', '/me', { token: host })).body.user.role).toBe('teacher');
  });
});
