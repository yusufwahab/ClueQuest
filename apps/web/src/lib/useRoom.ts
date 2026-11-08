import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Avatar } from '@cluequest/game-core';
import { API_BASE } from './api';

export interface RoomState {
  v: number; code: string; phase: 'lobby' | 'question' | 'locked' | 'finished' | 'cancelled'; title: string; style: 'points' | 'steps';
  steps: { wrong: 'stay' | 'down' }; secondsPerQuestion: number; qIndex: number; total: number; serverNow: number; deadline: number | null;
  question: null | { id: string; text: string; image: { id: string; alt: string; url: string | null } | null; marks: number; points: number; options: { id: string; text: string }[]; correctId?: string; explanation?: string; counts?: Record<string, number> };
  answered: number; playerCount: number; players: { id: string; nickname: string; avatar: Avatar; answered: boolean }[];
  chat: ChatMessage[]; chatEnabled: boolean;
  myAnswer: string | null; me: null | { id: string; nickname: string; avatar: Avatar; rank: number; points: number; step: number; marks: number; correct: number };
  standings: Standing[]; finalStandings: Standing[] | null; role: 'host' | 'player';
  board: { id: string; nickname: string; avatar?: Avatar; step: number }[];
}
export interface ChatMessage { id: number; playerId: string | null; nickname: string; host: boolean; body: string; at: number }
export interface ReactionBurst { id: string; playerId: string | null; nickname: string; reaction: string; x: number }
export interface Standing { id: string; nickname: string; avatar?: Avatar; rank: number; points: number; step: number; marks: number; correct: number }
export type Conn = 'connecting' | 'online' | 'offline' | 'rejected';

/** Connects with the stored credential and re-syncs from the server after any drop. The server owns all state. */
export function useRoom(code: string, auth: { token?: string; accessToken?: string }) {
  const [state, setState] = useState<RoomState | null>(null);
  const [conn, setConn] = useState<Conn>('connecting');
  const [skew, setSkew] = useState(0);
  const [extraChat, setExtraChat] = useState<ChatMessage[]>([]);
  const [bursts, setBursts] = useState<ReactionBurst[]>([]);
  const sock = useRef<Socket | null>(null);
  const authKey = `${auth.token ?? ''}|${auth.accessToken ?? ''}`;

  useEffect(() => {
    const s = io(API_BASE || undefined, { auth: { code, ...(auth.token ? { token: auth.token } : {}), ...(auth.accessToken ? { accessToken: auth.accessToken } : {}) }, transports: ['websocket', 'polling'], reconnectionDelayMax: 3000 });
    sock.current = s;
    s.on('connect', () => setConn('online'));
    s.on('disconnect', () => setConn('offline'));
    s.on('connect_error', (e) => setConn(['not_joined', 'not_found', 'bad_code'].includes(e.message) ? 'rejected' : 'offline'));
    s.on('state', (st: RoomState) => { setSkew(st.serverNow - Date.now()); setState((cur) => (cur && st.v < cur.v ? cur : st)); });
    // Chat and reactions arrive as their own events, so a message shows up at once without re-sending the whole room.
    s.on('chat', (m: ChatMessage) => setExtraChat((cur) => (cur.some((c) => c.id === m.id) ? cur : [...cur.slice(-59), m])));
    s.on('reaction', (r: Omit<ReactionBurst, 'x'>) => {
      const b = { ...r, x: 8 + Math.random() * 84 };
      setBursts((cur) => [...cur.slice(-14), b]);
      setTimeout(() => setBursts((cur) => cur.filter((c) => c.id !== b.id)), 2600);
    });
    return () => { s.close(); sock.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, authKey]);

  const emit = useCallback((ev: string, body: unknown) => new Promise<{ ok: boolean; error?: string; data?: any }>((resolve) => {
    const s = sock.current;
    if (!s) return resolve({ ok: false, error: 'Not connected' });
    s.timeout(8000).emit(ev, body, (err: unknown, r: any) => resolve(err ? { ok: false, error: 'No response. Check your connection.' } : r));
  }), []);

  // the recent chat from the last snapshot, plus anything that arrived since, with no duplicates and in order
  const chat = useMemo(() => {
    const seen = new Set<number>(); const out: ChatMessage[] = [];
    for (const m of [...(state?.chat ?? []), ...extraChat]) if (!seen.has(m.id)) { seen.add(m.id); out.push(m); }
    return out.sort((a, b) => a.id - b.id).slice(-60);
  }, [state?.chat, extraChat]);

  return { state, conn, emit, now: () => Date.now() + skew, chat, bursts };
}
