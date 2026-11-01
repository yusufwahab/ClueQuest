import type { Server as IOServer, Socket } from 'socket.io';
import { isValidRoomCode } from '@cluequest/game-core';
import { ZodError } from 'zod';
import type { Ctx } from './ctx';
import { HttpError } from './db/util';
import type { Viewer } from './live';

type Ack = (r: { ok: boolean; error?: string; code?: string; data?: unknown }) => void;

function bucket(rate: number, burst: number) {
  let tokens = burst; let last = Date.now();
  return () => { const now = Date.now(); tokens = Math.min(burst, tokens + ((now - last) / 1000) * rate); last = now; if (tokens < 1) return false; tokens -= 1; return true; };
}
function toAck(e: unknown) {
  if (e instanceof HttpError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ZodError) return { ok: false, error: 'Invalid request', code: 'invalid' };
  console.error('[socket] unexpected', e);
  return { ok: false, error: 'Something went wrong', code: 'internal' };
}

/** Handshake auth: { code, token } for a player, { code, accessToken } for the host. Reconnects simply repeat the handshake. */
export function attachSockets(io: IOServer, ctx: Ctx) {
  const { live, auth } = ctx;
  live.io = io;
  io.use(async (socket, next) => {
    try {
      const a = socket.handshake.auth as { code?: string; token?: string; accessToken?: string };
      if (!a.code || !isValidRoomCode(a.code)) return next(new Error('bad_code'));
      const room = await live.byCode(a.code);
      if (!room) return next(new Error('not_found'));
      let viewer: Viewer | null = null;
      if (a.accessToken) { const u = await auth.verify(a.accessToken); if (u && u.id === room.host_id) viewer = { kind: 'host', userId: u.id }; }
      if (!viewer) { const pid = live.playerFromToken(a.token); if (pid) viewer = { kind: 'player', playerId: pid }; }
      if (!viewer) return next(new Error('not_joined'));
      socket.data.viewer = viewer; socket.data.roomId = room.id;
      next();
    } catch { next(new Error('auth_failed')); }
  });

  io.on('connection', (socket: Socket) => {
    const viewer = socket.data.viewer as Viewer; const roomId = socket.data.roomId as string;
    void socket.join(`r:${roomId}`);
    live.snapshot(roomId, viewer).then((s) => socket.emit('state', s)).catch(() => undefined);
    const allow = bucket(8, 16);
    const wrap = (fn: (b: any) => Promise<unknown>) => async (body: unknown, ack?: Ack) => {
      if (typeof ack !== 'function') return;
      if (!allow()) return ack({ ok: false, error: 'Slow down', code: 'rate_limited' });
      try { ack({ ok: true, data: await fn(body as any) }); } catch (e) { ack(toAck(e)); }
    };
    socket.on('sync', wrap(async () => live.snapshot(roomId, viewer)));
    socket.on('answer', wrap(async (b: { questionId?: string; optionId?: string }) => {
      if (viewer.kind !== 'player') throw new HttpError(403, 'Hosts do not answer', 'forbidden');
      if (typeof b?.questionId !== 'string' || typeof b?.optionId !== 'string') throw new HttpError(400, 'Invalid answer', 'invalid');
      return live.submitAnswer(roomId, viewer.playerId, b.questionId, b.optionId);
    }));
    socket.on('host', wrap(async (b: { cmd?: string; playerId?: string }) => {
      if (viewer.kind !== 'host') throw new HttpError(403, 'Only the host can do that', 'forbidden');
      if (!['start', 'lock', 'next', 'end', 'kick'].includes(String(b?.cmd))) throw new HttpError(400, 'Unknown command', 'invalid');
      return live.command(roomId, viewer.userId, b.cmd as 'start' | 'lock' | 'next' | 'end' | 'kick', { playerId: b.playerId });
    }));
  });
}
