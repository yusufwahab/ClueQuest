import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Server as IOServer } from 'socket.io';
import { REACTIONS, checkChatText, checkNickname, defaultAvatar, disambiguate, gradeAttempt, normaliseAvatar, optionOrder, rankStandings, scheduleState, type Avatar, type Style } from '@cluequest/game-core';
import { limits } from '@cluequest/config';
import type { Db, Queryable } from './db/db';
import { HttpError, many, one } from './db/util';
import { imageView } from './images';
import type { Env } from './env';
import { QuizService, type StoredQuestion } from './quizzes';
import { graded } from './attempts';

export type Viewer = { kind: 'host'; userId: string } | { kind: 'player'; playerId: string };
const TERMINAL = ['finished', 'cancelled'];

/**
 * Live rooms. The database is authoritative; there is no in-memory score. Standings are always derived from the
 * accepted answers (one row per player per question), so a reconnect or a repeated tap can never score twice.
 */
export class LiveService {
  io?: IOServer;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private queues = new Map<string, Promise<unknown>>();
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private versions = new Map<string, StoredQuestion[]>();
  constructor(private db: Db, private env: Env, private quizzes: QuizService) {}

  // ---- credentials -------------------------------------------------------------------------------------------
  private sign(id: string) { return createHmac('sha256', this.env.AUTH_SECRET).update(`player:${id}`).digest('base64url'); }
  playerToken(id: string) { return `${id}.${this.sign(id)}`; }
  playerFromToken(token?: string): string | null {
    const [id, sig] = (token ?? '').split('.');
    if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
    const a = Buffer.from(sig); const b = Buffer.from(this.sign(id));
    return a.length === b.length && timingSafeEqual(a, b) ? id : null;
  }

  private run<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(roomId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(fn);
    this.queues.set(roomId, next.catch(() => undefined));
    return next;
  }

  private async questions(activity: any): Promise<StoredQuestion[]> {
    const key = `${activity.quiz_id}:${activity.quiz_version}`;
    let q = this.versions.get(key);
    if (!q) { q = (await this.quizzes.getVersion(activity.quiz_id, activity.quiz_version)).questions; this.versions.set(key, q); }
    return q;
  }
  private async roomRow(id: string, q: Queryable = this.db) {
    const r = await one<any>(q, 'select r.*, row_to_json(a.*) as activity from rooms r join activities a on a.id=r.activity_id where r.id=$1', [id]);
    if (!r) throw new HttpError(404, 'Room not found', 'not_found');
    return r;
  }
  async byCode(code: string) {
    const r = await one<any>(this.db, "select id from rooms where code=$1 order by (phase in ('finished','cancelled')), created_at desc limit 1", [code]);
    return r ? this.roomRow(r.id) : null;
  }

  // ---- host: create ------------------------------------------------------------------------------------------
  async createRoom(hostId: string, activityId: string) {
    const act = await this.quizzes.ownActivity(activityId, hostId);
    if (act.mode !== 'live') throw new HttpError(422, 'Only live activities can open a room', 'wrong_mode');
    if (act.status !== 'open') throw new HttpError(403, 'This activity is closed', 'closed');
    for (let i = 0; i < 8; i++) {
      try {
        const r = await one<any>(this.db, 'insert into rooms(activity_id,host_id,code) values ($1,$2,$3) returning id, code', [activityId, hostId, QuizService.randomRoomCode()]);
        this.armStart(r.id as string, act.settings);
        return { id: r.id as string, code: r.code as string };
      } catch (e) { if (!/rooms_active_code|duplicate key/.test(String((e as Error).message))) throw e; }
    }
    throw new HttpError(503, 'Could not allocate a room code, try again', 'busy');
  }

  async preview(code: string) {
    const r = await this.byCode(code);
    if (!r) throw new HttpError(404, 'No game has that code. Check the 6 digits and try again.', 'not_found');
    if (TERMINAL.includes(r.phase)) throw new HttpError(410, r.phase === 'cancelled' ? 'This game was cancelled by the host.' : 'This game has ended.', 'ended', { title: r.activity.title, phase: r.phase });
    const n = await one<any>(this.db, 'select count(*)::int as n from room_players where room_id=$1 and not removed', [r.id]);
    const sc = scheduleState(r.activity.settings, Date.now());
    const waiting = r.phase === 'lobby' && !sc.joinOpen;
    return { code: r.code, title: r.activity.title, style: r.activity.style, phase: r.phase, players: n.n, schedule: { mode: sc.mode, startsAt: sc.startsAt, canJoin: !waiting, serverNow: Date.now() } };
  }

  // ---- players -----------------------------------------------------------------------------------------------
  async join(code: string, nickname: string, resumeToken?: string, avatar?: unknown) {
    const r = await this.byCode(code);
    if (!r) throw new HttpError(404, 'No game has that code. Check the 6 digits and try again.', 'not_found');
    if (TERMINAL.includes(r.phase)) throw new HttpError(410, r.phase === 'cancelled' ? 'This game was cancelled by the host.' : 'This game has ended.', 'ended', { title: r.activity.title, phase: r.phase });
    const existingId = this.playerFromToken(resumeToken);
    if (existingId) {
      const p = await one<any>(this.db, 'select * from room_players where id=$1 and room_id=$2 and not removed', [existingId, r.id]);
      if (p) return { playerId: p.id as string, nickname: p.nickname as string, token: this.playerToken(p.id), resumed: true, roomId: r.id as string };
    }
    const sc = scheduleState(r.activity.settings, Date.now());
    if (r.phase === 'lobby' && !sc.joinOpen) throw new HttpError(403, 'This quest has not started yet', 'not_started', { startsAt: sc.startsAt, startMode: sc.mode });
    const chk = checkNickname(nickname);
    if (!chk.ok) throw new HttpError(422, chk.reason, 'bad_nickname');
    const out = await this.run(r.id, async () => {
      const taken = await many<any>(this.db, 'select nickname from room_players where room_id=$1', [r.id]);
      if (taken.length >= Math.min(this.env.MAX_PLAYERS_PER_ROOM, limits.maxLivePlayers)) throw new HttpError(403, 'This game is full', 'full');
      const nick = disambiguate(chk.nickname, new Set(taken.map((t) => t.nickname)));
      const look = normaliseAvatar(avatar) ?? defaultAvatar(nick);
      const p = await one<any>(this.db, 'insert into room_players(room_id,nickname,token_hash,avatar) values ($1,$2,gen_random_uuid()::text,$3::jsonb) returning id', [r.id, nick, JSON.stringify(look)]);
      return { playerId: p.id as string, nickname: nick, token: this.playerToken(p.id), resumed: false, roomId: r.id as string };
    });
    this.broadcast(r.id);
    void this.startIfDue(r.id); // an automatic start that was waiting for its first player
    return out;
  }

  /** Accept at most one answer per player per question, atomically, and only while the question is open. */
  async submitAnswer(roomId: string, playerId: string, questionId: string, optionId: string) {
    const room = await this.roomRow(roomId);
    const qs = await this.questions(room.activity);
    const cur = qs[room.q_index];
    if (!cur || cur.id !== questionId || !cur.options.some((o) => o.id === optionId)) throw new HttpError(400, 'That question is not open', 'not_open');
    const player = await one<any>(this.db, 'select id from room_players where id=$1 and room_id=$2 and not removed', [playerId, roomId]);
    if (!player) throw new HttpError(403, 'You are not in this game', 'not_in_room');
    await this.db.query(
      `insert into room_answers(room_id,player_id,question_id,option_id)
       select $1,$2,$3,$4 where exists (select 1 from rooms where id=$1 and phase='question' and q_index=$5 and deadline + ($6 || ' milliseconds')::interval >= now())
       on conflict do nothing`, [roomId, playerId, questionId, optionId, room.q_index, String(this.env.ANSWER_GRACE_MS)]);
    const stored = await one<any>(this.db, 'select option_id from room_answers where room_id=$1 and player_id=$2 and question_id=$3', [roomId, playerId, questionId]);
    if (!stored) throw new HttpError(409, 'Time is up for this question', 'closed');
    this.broadcastSoon(roomId);
    return { optionId: stored.option_id as string, locked: true };
  }

  // ---- scheduled start ------------------------------------------------------------------------------------------------
  private startTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private disarmStart(roomId: string) { const t = this.startTimers.get(roomId); if (t) clearTimeout(t); this.startTimers.delete(roomId); }
  /** For a room that starts itself: wake up at the set time. (Long waits are re-armed, since timers cannot exceed about 24 days.) */
  private armStart(roomId: string, settings: any) {
    this.disarmStart(roomId);
    const sc = scheduleState(settings, Date.now());
    if (sc.mode !== 'auto' || !sc.startsAt || sc.open) return;
    const wait = Math.min(Date.parse(sc.startsAt) - Date.now(), 2_000_000_000);
    const t = setTimeout(() => { this.startTimers.delete(roomId); void this.startIfDue(roomId, true); }, Math.max(0, wait));
    t.unref();
    this.startTimers.set(roomId, t);
  }
  /**
   * Start an automatic room once its time has come and someone is in it. With nobody there the room waits, and the first
   * player to arrive starts it. A manual room is never started here: that is the host's button.
   */
  async startIfDue(roomId: string, rearm = false) {
    let started = false;
    try {
      await this.run(roomId, async () => {
        const room = await this.roomRow(roomId);
        if (room.phase !== 'lobby') return;
        const sc = scheduleState(room.activity.settings, Date.now());
        if (sc.mode !== 'auto') return;
        if (!sc.due) { if (rearm) this.armStart(roomId, room.activity.settings); return; }
        const n = await one<any>(this.db, 'select count(*)::int as n from room_players where room_id=$1 and not removed', [roomId]);
        if (!n.n) return;
        await this.openQuestion(room, 0);
        await this.db.query('update rooms set version=version+1 where id=$1', [roomId]);
        started = true;
      });
    } catch (e) { console.error('[live] scheduled start', (e as Error).message); }
    if (started) this.broadcast(roomId);
  }
  /** After the host changes a quest's schedule: re-arm every waiting room of that quest. */
  async rearmActivity(activityId: string) {
    const rows = await many<any>(this.db, "select r.id, row_to_json(a.*) as activity from rooms r join activities a on a.id=r.activity_id where r.activity_id=$1 and r.phase='lobby'", [activityId]);
    for (const r of rows) { this.armStart(r.id, r.activity.settings); this.broadcast(r.id); void this.startIfDue(r.id); }
  }

  // ---- avatars, chat and reactions ---------------------------------------------------------------------------------------
  private lastSaid = new Map<string, number>();
  /** True when this sender is posting faster than allowed. */
  private tooFast(key: string, gapMs: number) {
    const now = Date.now(); const last = this.lastSaid.get(key) ?? 0;
    if (now - last < gapMs) return true;
    this.lastSaid.set(key, now);
    if (this.lastSaid.size > 5000) for (const [k, v] of this.lastSaid) if (now - v > 60_000) this.lastSaid.delete(k);
    return false;
  }

  async setAvatar(roomId: string, playerId: string, avatar: unknown) {
    const look = normaliseAvatar(avatar);
    if (!look) throw new HttpError(400, 'That look is not valid', 'invalid');
    const mine = await one<any>(this.db, 'select id from room_players where id=$1 and room_id=$2 and not removed', [playerId, roomId]);
    if (!mine) throw new HttpError(403, 'You are not in this game', 'not_in_room');
    await this.db.query('update room_players set avatar=$2::jsonb where id=$1', [playerId, JSON.stringify(look)]);
    await this.db.query('update rooms set version=version+1 where id=$1', [roomId]);
    this.broadcast(roomId);
    return { avatar: look };
  }

  /** Chat and reactions are for the lobby and the breaks between questions, never while a question is open. The host may post any time. */
  async say(roomId: string, viewer: Viewer, kind: 'chat' | 'reaction', body: unknown) {
    const room = await this.roomRow(roomId);
    const host = viewer.kind === 'host';
    if (room.phase === 'cancelled') throw new HttpError(409, 'This game has ended', 'bad_phase');
    if (!host && room.phase === 'question') throw new HttpError(409, 'Chat opens again when the question closes.', 'bad_phase');
    let nickname = 'Host'; let playerId: string | null = null;
    if (viewer.kind === 'player') {
      const p = await one<any>(this.db, 'select id,nickname from room_players where id=$1 and room_id=$2 and not removed', [viewer.playerId, roomId]);
      if (!p) throw new HttpError(403, 'You are not in this game', 'not_in_room');
      nickname = p.nickname; playerId = p.id;
    }
    const who = playerId ?? `host:${roomId}`;
    if (kind === 'reaction') {
      if (typeof body !== 'string' || !(REACTIONS as readonly string[]).includes(body)) throw new HttpError(400, 'Unknown reaction', 'invalid');
      if (this.tooFast(`r:${who}`, 500)) throw new HttpError(429, 'Slow down', 'rate_limited');
      this.io?.to(`r:${roomId}`).emit('reaction', { id: `${who}:${Date.now()}`, playerId, nickname, reaction: body });
      return { sent: true };
    }
    if (!host && !room.chat_enabled) throw new HttpError(403, 'The host has turned chat off.', 'chat_off');
    const chk = checkChatText(typeof body === 'string' ? body : '');
    if (!chk.ok) throw new HttpError(422, chk.reason, 'bad_message');
    if (this.tooFast(`c:${who}`, 1200)) throw new HttpError(429, 'Wait a moment before sending another message.', 'rate_limited');
    const row = await one<any>(this.db, 'insert into room_chat(room_id,player_id,nickname,from_host,body) values ($1,$2,$3,$4,$5) returning id, created_at', [roomId, playerId, nickname, host, chk.text]);
    const msg = { id: Number(row.id), playerId, nickname, host, body: chk.text, at: new Date(row.created_at).getTime() };
    this.io?.to(`r:${roomId}`).emit('chat', msg);
    return msg;
  }

  // ---- host commands ---------------------------------------------------------------------------------------------
  async command(roomId: string, hostId: string, cmd: 'start' | 'lock' | 'next' | 'end' | 'kick' | 'chat', arg?: { playerId?: string; on?: boolean }) {
    const out = await this.run(roomId, async () => {
      const room = await this.roomRow(roomId);
      if (room.host_id !== hostId) throw new HttpError(403, 'Only the host can do that', 'forbidden');
      const qs = await this.questions(room.activity);
      switch (cmd) {
        case 'start': {
          if (room.phase !== 'lobby') throw new HttpError(409, 'The game has already started', 'bad_phase');
          const n = await one<any>(this.db, 'select count(*)::int as n from room_players where room_id=$1 and not removed', [roomId]);
          if (!n.n) throw new HttpError(422, 'Wait for at least one player to join', 'no_players');
          await this.openQuestion(room, 0);
          break;
        }
        case 'lock':
          if (room.phase !== 'question') throw new HttpError(409, 'No question is open', 'bad_phase');
          await this.lockRoom(roomId);
          break;
        case 'next':
          if (room.phase !== 'locked') throw new HttpError(409, 'Close the current question first', 'bad_phase');
          if (room.q_index + 1 < qs.length) await this.openQuestion(room, room.q_index + 1);
          else await this.finishRoom(roomId);
          break;
        case 'end':
          if (TERMINAL.includes(room.phase)) break;
          if (room.phase === 'lobby') { await this.db.query("update rooms set phase='cancelled', finished_at=now(), version=version+1 where id=$1", [roomId]); this.clearTimer(roomId); break; }
          if (room.phase === 'question') await this.lockRoom(roomId);
          await this.finishRoom(roomId);
          break;
        case 'chat':
          await this.db.query('update rooms set chat_enabled=$2 where id=$1', [roomId, arg?.on !== false]);
          break;
        case 'kick':
          if (arg?.playerId) await this.db.query('update room_players set removed=true where id=$1 and room_id=$2', [arg.playerId, roomId]);
          break;
      }
      await this.db.query('update rooms set version=version+1 where id=$1', [roomId]);
    });
    this.broadcast(roomId);
    return out;
  }

  private clearTimer(roomId: string) { this.disarmStart(roomId); const t = this.timers.get(roomId); if (t) clearTimeout(t); this.timers.delete(roomId); }
  private schedule(roomId: string, deadline: Date) {
    this.clearTimer(roomId);
    const wait = Math.max(0, deadline.getTime() + this.env.ANSWER_GRACE_MS - Date.now());
    const t = setTimeout(() => {
      this.timers.delete(roomId);
      void this.run(roomId, async () => {
        const r = await this.roomRow(roomId);
        if (r.phase === 'question') { await this.lockRoom(roomId); await this.db.query('update rooms set version=version+1 where id=$1', [roomId]); }
      }).then(() => this.broadcast(roomId)).catch((e) => console.error('[live] lock timer', e));
    }, wait);
    t.unref();
    this.timers.set(roomId, t);
  }
  private async openQuestion(room: any, idx: number) {
    const secs = (room.activity.settings as any).secondsPerQuestion ?? 30;
    const deadline = new Date(Date.now() + secs * 1000);
    await this.db.query("update rooms set phase='question', q_index=$2, opened_at=now(), deadline=$3 where id=$1", [room.id, idx, deadline]);
    this.schedule(room.id, deadline);
  }
  private async lockRoom(roomId: string) {
    this.clearTimer(roomId);
    await this.db.query("update rooms set phase='locked' where id=$1 and phase='question'", [roomId]);
  }
  /** Persist final standings once. Safe to call twice: the phase guard and delete-then-insert keep it a single result. */
  private async finishRoom(roomId: string) {
    this.clearTimer(roomId);
    const room = await this.roomRow(roomId);
    if (room.phase === 'finished') return;
    const table = await this.standings(room, true);
    await this.db.tx(async (q) => {
      await q.query('delete from room_results where room_id=$1', [roomId]);
      for (const s of table) {
        await q.query('insert into room_results(room_id,player_id,nickname,rank,marks_earned,marks_possible,points,step_position,correct) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [roomId, s.id, s.nickname, s.rank, s.marks, s.marksPossible, s.points, s.step, s.correct]);
      }
      await q.query("update rooms set phase='finished', finished_at=now() where id=$1", [roomId]);
    });
  }

  // ---- derived state ------------------------------------------------------------------------------------------------
  private async standings(room: any, forceAll = false) {
    const qs = await this.questions(room.activity);
    const scoredUpTo = room.phase === 'question' && !forceAll ? room.q_index - 1 : room.q_index;
    const slice = qs.slice(0, Math.max(0, scoredUpTo + 1));
    const players = await many<any>(this.db, 'select id,nickname,avatar from room_players where room_id=$1 and not removed', [room.id]);
    const rows = await many<any>(this.db, 'select player_id,question_id,option_id from room_answers where room_id=$1', [room.id]);
    const byPlayer = new Map<string, Record<string, string>>();
    for (const r of rows) { const m = byPlayer.get(r.player_id) ?? {}; m[r.question_id] = r.option_id; byPlayer.set(r.player_id, m); }
    const steps = (room.activity.settings as any).steps ?? { wrong: 'stay' };
    const scored = players.map((p) => {
      const g = gradeAttempt(graded(slice), byPlayer.get(p.id) ?? {}, steps);
      return { id: p.id as string, nickname: p.nickname as string, avatar: (normaliseAvatar(p.avatar) ?? defaultAvatar(p.nickname)) as Avatar, points: g.points, step: g.stepPosition, marks: g.marksEarned, marksPossible: g.marksPossible, correct: g.correctCount };
    });
    return rankStandings(scored, room.activity.style as Style);
  }

  async snapshot(roomId: string, viewer: Viewer) {
    const room = await this.roomRow(roomId);
    const qs = await this.questions(room.activity);
    const s = room.activity.settings as any;
    const isHost = viewer.kind === 'host';
    const players = await many<any>(this.db, 'select id,nickname,avatar from room_players where room_id=$1 and not removed order by joined_at', [roomId]);
    const look = (p: any): Avatar => normaliseAvatar(p.avatar) ?? defaultAvatar(p.nickname);
    const chat = (await many<any>(this.db, 'select id,player_id,nickname,from_host,body,created_at from (select * from room_chat where room_id=$1 order by id desc limit 40) c order by id', [roomId])).map((c) => ({ id: Number(c.id), playerId: c.player_id as string | null, nickname: c.nickname as string, host: !!c.from_host, body: c.body as string, at: new Date(c.created_at).getTime() }));
    const cur = qs[room.q_index];
    const open = room.phase === 'question' || room.phase === 'locked';
    const answers = cur ? await many<any>(this.db, 'select player_id,option_id from room_answers where room_id=$1 and question_id=$2', [roomId, cur.id]) : [];
    const table = room.phase === 'lobby' ? [] : await this.standings(room);
    const revealed = room.phase === 'locked' || room.phase === 'finished';
    const myAnswer = viewer.kind === 'player' ? answers.find((a) => a.player_id === viewer.playerId)?.option_id ?? null : null;
    const me = viewer.kind === 'player' ? table.find((t) => t.id === (viewer as any).playerId) : undefined;
    const counts: Record<string, number> = {};
    if (revealed && cur) for (const a of answers) counts[a.option_id] = (counts[a.option_id] ?? 0) + 1;
    const view = (t: (typeof table)[number]) => ({ id: t.id, nickname: t.nickname, avatar: t.avatar, rank: t.rank, points: t.points, step: t.step, marks: t.marks, correct: t.correct });
    return {
      v: room.version, code: room.code, phase: room.phase as string, title: room.activity.title, style: room.activity.style as Style,
      steps: s.steps ?? { wrong: 'stay' }, secondsPerQuestion: s.secondsPerQuestion ?? 30,
      qIndex: room.q_index, total: qs.length, serverNow: Date.now(), deadline: room.deadline ? new Date(room.deadline).getTime() : null,
      question: open && cur ? {
        id: cur.id, text: cur.text, image: imageView(this.env, cur.image), marks: cur.marks, points: cur.points,
        options: isHost ? cur.options : optionOrder(cur.options, (viewer as any).playerId, cur.id),
        ...(revealed ? { correctId: cur.correctId, explanation: cur.explanation, counts } : {}),
      } : null,
      answered: answers.length, playerCount: players.length,
      // Everyone sees who is in the room and who has answered, just as the host does.
      players: players.map((p) => ({ id: p.id, nickname: p.nickname, avatar: look(p), answered: answers.some((a) => a.player_id === p.id) })),
      chat, chatEnabled: !!room.chat_enabled,
      schedule: (() => { const sc = scheduleState(s, Date.now()); return { mode: sc.mode, startsAt: sc.startsAt, due: sc.due }; })(),
      myAnswer, me: me ? view(me) : null,
      // Standings appear only once a question is closed, never while answers are still coming in.
      standings: room.phase === 'locked' || room.phase === 'finished' ? table.map(view) : [],
      // Everyone's step, for the shared staircase. Scores only count closed questions, so this never reveals answers that are still coming in.
      board: room.activity.style === 'steps' ? (room.phase === 'lobby' ? players.map((p) => ({ id: p.id, nickname: p.nickname, avatar: look(p), step: 0 })) : table.map((t) => ({ id: t.id, nickname: t.nickname, avatar: t.avatar, step: t.step }))) : [],
      finalStandings: room.phase === 'finished' ? table.map(view) : null,
      role: isHost ? 'host' : 'player',
    };
  }

  // ---- fan-out -------------------------------------------------------------------------------------------------
  broadcastSoon(roomId: string) {
    if (this.pending.has(roomId)) return;
    const t = setTimeout(() => { this.pending.delete(roomId); this.broadcast(roomId); }, 120);
    t.unref();
    this.pending.set(roomId, t);
  }
  broadcast(roomId: string) {
    const io = this.io;
    if (!io) return;
    void (async () => {
      const sockets = await io.in(`r:${roomId}`).fetchSockets();
      await Promise.all(sockets.map(async (s) => {
        const v = s.data.viewer as Viewer | undefined;
        if (!v) return;
        try { s.emit('state', await this.snapshot(roomId, v)); } catch (e) { console.error('[live] broadcast', (e as Error).message); }
      }));
    })();
  }

  async hostResults(hostId: string) {
    return many(this.db, `select r.id, r.code, a.title, a.style, r.phase, r.created_at as "createdAt", r.finished_at as "finishedAt",
        (select count(*)::int from room_players p where p.room_id=r.id) as players
      from rooms r join activities a on a.id=r.activity_id where r.host_id=$1 order by r.created_at desc`, [hostId]);
  }
  async roomResults(roomId: string, hostId: string) {
    const room = await this.roomRow(roomId);
    if (room.host_id !== hostId) throw new HttpError(404, 'Room not found', 'not_found');
    const rows = await many(this.db, 'select player_id as id, nickname, rank, marks_earned::float as marks, marks_possible::float as "marksPossible", points, step_position as step, correct from room_results where room_id=$1 order by rank, nickname', [roomId]);
    return { room: { id: room.id, code: room.code, title: room.activity.title, style: room.activity.style, phase: room.phase }, results: rows };
  }

  /** After a restart: reopen the lock timer of any question that was open (answers already stored stay locked). */
  async recover() {
    const rows = await many<any>(this.db, "select id, deadline from rooms where phase='question'");
    for (const r of rows) this.schedule(r.id, new Date(r.deadline));
    const waiting = await many<any>(this.db, "select r.id, row_to_json(a.*) as activity from rooms r join activities a on a.id=r.activity_id where r.phase='lobby'");
    for (const r of waiting) { this.armStart(r.id, r.activity.settings); void this.startIfDue(r.id); }
    return rows.length;
  }
  stop() { for (const t of this.startTimers.values()) clearTimeout(t); this.startTimers.clear(); for (const t of this.timers.values()) clearTimeout(t); for (const t of this.pending.values()) clearTimeout(t); this.timers.clear(); this.pending.clear(); }
}
