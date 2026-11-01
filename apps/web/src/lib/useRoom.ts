import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

export interface RoomState {
  v: number; code: string; phase: 'lobby' | 'question' | 'locked' | 'finished' | 'cancelled'; title: string; style: 'points' | 'steps';
  steps: { wrong: 'stay' | 'down' }; secondsPerQuestion: number; qIndex: number; total: number; serverNow: number; deadline: number | null;
  question: null | { id: string; text: string; marks: number; points: number; options: { id: string; text: string }[]; correctId?: string; explanation?: string; counts?: Record<string, number> };
  answered: number; playerCount: number; players?: { id: string; nickname: string; answered: boolean }[];
  myAnswer: string | null; me: null | { id: string; nickname: string; rank: number; points: number; step: number; marks: number; correct: number };
  standings: Standing[]; finalStandings: Standing[] | null; role: 'host' | 'player';
}
export interface Standing { id: string; nickname: string; rank: number; points: number; step: number; marks: number; correct: number }
export type Conn = 'connecting' | 'online' | 'offline' | 'rejected';

/** Connects with the stored credential and re-syncs from the server after any drop. The server owns all state. */
export function useRoom(code: string, auth: { token?: string; accessToken?: string }) {
  const [state, setState] = useState<RoomState | null>(null);
  const [conn, setConn] = useState<Conn>('connecting');
  const [skew, setSkew] = useState(0);
  const sock = useRef<Socket | null>(null);
  const authKey = `${auth.token ?? ''}|${auth.accessToken ?? ''}`;

  useEffect(() => {
    const s = io({ auth: { code, ...(auth.token ? { token: auth.token } : {}), ...(auth.accessToken ? { accessToken: auth.accessToken } : {}) }, transports: ['websocket', 'polling'], reconnectionDelayMax: 3000 });
    sock.current = s;
    s.on('connect', () => setConn('online'));
    s.on('disconnect', () => setConn('offline'));
    s.on('connect_error', (e) => setConn(['not_joined', 'not_found', 'bad_code'].includes(e.message) ? 'rejected' : 'offline'));
    s.on('state', (st: RoomState) => { setSkew(st.serverNow - Date.now()); setState((cur) => (cur && st.v < cur.v ? cur : st)); });
    return () => { s.close(); sock.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, authKey]);

  const emit = useCallback((ev: string, body: unknown) => new Promise<{ ok: boolean; error?: string; data?: any }>((resolve) => {
    const s = sock.current;
    if (!s) return resolve({ ok: false, error: 'Not connected' });
    s.timeout(8000).emit(ev, body, (err: unknown, r: any) => resolve(err ? { ok: false, error: 'No response. Check your connection.' } : r));
  }), []);

  return { state, conn, emit, now: () => Date.now() + skew };
}
