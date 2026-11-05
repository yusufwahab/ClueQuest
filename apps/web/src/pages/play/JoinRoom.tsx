import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { brand } from '@cluequest/config';
import { formatRoomCode, normaliseRoomCode } from '@cluequest/game-core';
import { ApiError, api } from '../../lib/api';
import { Backdrop, Logo, Notice } from '../../components/ui';

export const roomKey = (code: string) => `cq.room.${code}`;

export default function JoinRoom() {
  const params = useParams();
  const nav = useNavigate();
  const [code, setCode] = useState(params.code ? normaliseRoomCode(params.code) : '');
  const [nick, setNick] = useState(localStorage.getItem('cq.nick') ?? '');
  const [room, setRoom] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = code.length === 6 ? localStorage.getItem(roomKey(code)) : null;

  useEffect(() => {
    setRoom(null); setError('');
    if (code.length !== 6) return;
    api('GET', `/rooms/by-code/${code}`, { auth: false }).then(setRoom).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not check the code'));
  }, [code]);

  const join = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await api('POST', `/rooms/by-code/${code}/join`, { body: { nickname: nick || 'Player', resumeToken: saved ?? undefined }, auth: false });
      localStorage.setItem(roomKey(code), r.token); localStorage.setItem('cq.nick', r.nickname);
      nav(`/play/${code}`);
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not join'); setBusy(false); }
  };

  return (
    <Backdrop><main className="container-page max-w-md py-10">
      <Link to="/" className="mb-6 flex items-center gap-2.5 font-display text-2xl font-semibold text-white"><Logo light size={34} />{brand.name}</Link>
      <form className="card animate-rise space-y-4" onSubmit={join}>
        <h1 className="text-3xl">Join a live game</h1>
        {!params.code && <div><label className="label" htmlFor="rc">Room code</label><input id="rc" className="field text-center text-2xlst" inputMode="numeric" value={formatRoomCode(code)} onChange={(e) => setCode(normaliseRoomCode(e.target.value).slice(0, 6))} placeholder="000 000" /></div>}
        {room && <Notice kind="ok"><strong>{room.title}</strong> · {room.style === 'points' ? 'Points' : 'Steps'} · {room.players} joined</Notice>}
        {error && <Notice kind="bad">{error}</Notice>}
        {saved && room ? (
          <p className="hint">You already joined this game on this device. Rejoin to keep your place and score.</p>
        ) : null}
        <div><label className="label" htmlFor="nick">Your nickname</label><input id="nick" className="field" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} autoComplete="nickname" required={!saved} /></div>
        <button className="btn btn-primary w-full" disabled={busy || !room}>{saved ? 'Rejoin game' : 'Join game'}</button>
      </form>
    </main></Backdrop>
  );
}
