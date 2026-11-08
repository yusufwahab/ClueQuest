import type { Db } from './db/db';
import { many, one } from './db/util';

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

/**
 * Platform-wide numbers for the super admin. Counts and trends only: it never returns a player's answers, a candidate's result or any
 * personal detail of the people who play. Host names and emails are shown because the super admin runs the platform.
 */
export class AdminService {
  constructor(private db: Db) {}

  private async series(sql: string, days: number) {
    const rows = await many<any>(this.db, sql, [String(days)]);
    return new Map<string, number>(rows.map((r) => [String(r.day), Number(r.n)]));
  }

  async analytics(days = 30) {
    const d = Math.min(Math.max(Math.floor(days) || 30, 7), 90);
    const q = <T = any>(sql: string, params: unknown[] = []) => one<T>(this.db, sql, params);

    const hosts = await q(`select
        count(*)::int as total,
        count(*) filter (where created_at >= now() - interval '7 days')::int as new7,
        count(*) filter (where created_at >= now() - interval '30 days')::int as new30
      from users where role='teacher'`);
    const active = (n: number) => q(`select count(*)::int as n from (
        select owner_id as u from activities where created_at >= now() - ($1 || ' days')::interval and owner_id is not null
        union select host_id from rooms where created_at >= now() - ($1 || ' days')::interval
        union select owner_id from quizzes where updated_at >= now() - ($1 || ' days')::interval) x`, [String(n)]);
    const [active7, active30] = await Promise.all([active(7), active(30)]);

    const content = await q(`select
        (select count(*)::int from quizzes where kind='quest') as quizzes,
        (select count(*)::int from quizzes where kind='exam') as "examSets",
        (select count(*)::int from quizzes where status='published') as published,
        (select count(*)::int from images) as images,
        (select count(*)::int from activities where mode='solo') as solo,
        (select count(*)::int from activities where mode='live') as live,
        (select count(*)::int from activities where mode='cbt') as cbt,
        (select count(*)::int from activities where style='points' and mode<>'cbt') as points,
        (select count(*)::int from activities where style='steps' and mode<>'cbt') as steps`);

    const live = await q(`select
        (select count(*)::int from rooms) as rooms,
        (select count(*)::int from rooms where phase='finished') as finished,
        (select count(*)::int from rooms where phase='cancelled') as cancelled,
        (select count(*)::int from rooms where phase in ('lobby','question','locked')) as "inProgress",
        (select count(*)::int from room_players where not removed) as players,
        (select count(*)::int from room_players p join rooms r on r.id=p.room_id where r.phase in ('lobby','question','locked') and not p.removed) as "playersNow",
        (select coalesce(max(c),0)::int from (select count(*) c from room_players where not removed group by room_id) t) as biggest,
        (select count(*)::int from rooms where created_at >= now() - interval '7 days') as games7,
        (select count(*)::int from room_players where joined_at >= now() - interval '7 days') as players7`);
    const finishedPlayers = await q(`select coalesce(avg(c),0)::float as avg from (select count(*) c from room_players p join rooms r on r.id=p.room_id where r.phase <> 'cancelled' and not p.removed group by p.room_id) t`);

    const attempts = await q(`select
        count(*) filter (where a.mode='solo')::int as "soloStarted",
        count(*) filter (where a.mode='solo' and t.status='submitted')::int as "soloDone",
        count(*) filter (where a.mode='cbt')::int as "cbtStarted",
        count(*) filter (where a.mode='cbt' and t.status='submitted')::int as "cbtDone",
        count(*) filter (where a.mode='cbt' and t.auto_submitted)::int as "cbtAuto",
        count(*) filter (where t.started_at >= now() - interval '7 days')::int as "started7"
      from attempts t join activities a on a.id=t.activity_id`);
    const invitations = await q('select count(*)::int as n from invitations');

    const partners = await q(`select
        (select count(*)::int from partners where active) as partners,
        (select count(*)::int from webhook_deliveries where status='pending') as pending,
        (select count(*)::int from webhook_deliveries where status='delivered') as delivered,
        (select count(*)::int from webhook_deliveries where status='failed') as failed`);

    // daily trends, newest last, with the quiet days filled in as zero
    const [sHosts, sGames, sPlayers, sAttempts] = await Promise.all([
      this.series(`select to_char(date_trunc('day', created_at),'YYYY-MM-DD') as day, count(*)::int as n from users where role='teacher' and created_at >= now() - ($1 || ' days')::interval group by 1`, d),
      this.series(`select to_char(date_trunc('day', created_at),'YYYY-MM-DD') as day, count(*)::int as n from rooms where created_at >= now() - ($1 || ' days')::interval group by 1`, d),
      this.series(`select to_char(date_trunc('day', joined_at),'YYYY-MM-DD') as day, count(*)::int as n from room_players where joined_at >= now() - ($1 || ' days')::interval group by 1`, d),
      this.series(`select to_char(date_trunc('day', started_at),'YYYY-MM-DD') as day, count(*)::int as n from attempts where started_at >= now() - ($1 || ' days')::interval group by 1`, d),
    ]);
    const trend: { day: string; hosts: number; games: number; players: number; attempts: number }[] = [];
    for (let i = d - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      trend.push({ day, hosts: sHosts.get(day) ?? 0, games: sGames.get(day) ?? 0, players: sPlayers.get(day) ?? 0, attempts: sAttempts.get(day) ?? 0 });
    }

    const topHosts = await many(this.db, `select u.id, u.display_name as name, u.email,
        (select count(*)::int from rooms r where r.host_id=u.id and r.created_at >= now() - interval '30 days') as games,
        (select count(*)::int from room_players p join rooms r on r.id=p.room_id where r.host_id=u.id and p.joined_at >= now() - interval '30 days') as players,
        (select count(*)::int from attempts t join activities a on a.id=t.activity_id where a.owner_id=u.id and t.started_at >= now() - interval '30 days') as attempts
      from users u where u.role='teacher' order by 4 + 5 desc, 3 desc limit 5`);
    const recentHosts = await many(this.db, `select id, display_name as name, email, created_at as "joinedAt" from users where role='teacher' order by created_at desc limit 6`);

    return {
      generatedAt: new Date().toISOString(), days: d,
      hosts: { ...hosts, active7: active7.n, active30: active30.n },
      content,
      live: { ...live, avgPlayersPerGame: Math.round(finishedPlayers.avg * 10) / 10, finishRate: pct(live.finished, live.finished + live.cancelled) },
      practice: { started: attempts.soloStarted, submitted: attempts.soloDone, completionRate: pct(attempts.soloDone, attempts.soloStarted) },
      cbt: { started: attempts.cbtStarted, submitted: attempts.cbtDone, autoSubmitted: attempts.cbtAuto, completionRate: pct(attempts.cbtDone, attempts.cbtStarted), invitations: invitations.n },
      reach: { started7: attempts.started7 },
      integrations: partners,
      trend, topHosts, recentHosts,
    };
  }

  /** Every host with how much they use the platform, newest activity first. */
  async hosts(search: string, page: number) {
    const per = 20;
    const like = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
    const offset = Math.max(0, page - 1) * per;
    const total = await one<any>(this.db, "select count(*)::int as n from users where role='teacher' and (email ilike $1 or display_name ilike $1)", [like]);
    const rows = await many(this.db, `select * from (
        select u.id, u.email, u.display_name as name, u.created_at as "joinedAt",
          (select count(*)::int from quizzes q where q.owner_id=u.id) as quizzes,
          (select count(*)::int from activities a where a.owner_id=u.id) as activities,
          (select count(*)::int from rooms r where r.host_id=u.id) as games,
          (select count(*)::int from room_players p join rooms r on r.id=p.room_id where r.host_id=u.id) as players,
          (select count(*)::int from attempts t join activities a on a.id=t.activity_id where a.owner_id=u.id) as attempts,
          greatest(u.created_at, (select max(updated_at) from quizzes q where q.owner_id=u.id), (select max(created_at) from activities a where a.owner_id=u.id), (select max(created_at) from rooms r where r.host_id=u.id)) as "lastActive"
        from users u where u.role='teacher' and (u.email ilike $1 or u.display_name ilike $1)) h
      order by "lastActive" desc limit ${per} offset ${offset}`, [like]);
    return { hosts: rows, total: total.n, page, pages: Math.max(1, Math.ceil(total.n / per)) };
  }
}
