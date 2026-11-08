import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { brand } from '@cluequest/config';
import { formatRoomCode, normaliseRoomCode } from '@cluequest/game-core';
import { ApiError, api } from '../../lib/api';
import { Backdrop, Logo, Notice } from '../../components/ui';
import { AvatarEditor, AvatarView, loadAvatar, saveAvatar } from '../../components/Avatar';
import { NotStarted } from '../../components/Schedule';

export const roomKey = (code: string) => `cq.room.${code}`;

export default function JoinRoom() {
  const params = useParams();
  const nav = useNavigate();
  const [code, setCode] = useState(params.code ? normaliseRoomCode(params.code) : '');
  const [nick, setNick] = useState(localStorage.getItem('cq.nick') ?? '');
  const [room, setRoom] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [avatar, setAvatar] = useState(() => loadAvatar());
  const [editing, setEditing] = useState(false);
  const saved = code.length === 6 ? localStorage.getItem(roomKey(code)) : null;

  const check = () => api('GET', `/rooms/by-code/${code}`, { auth: false }).then(setRoom).catch((e) => setError(e instanceof ApiError ? e.message : 'Could not check the code'));
  useEffect(() => {
    setRoom(null); setError('');
    if (code.length !== 6) return;
    void check();
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await api('POST', `/rooms/by-code/${code}/join`, { body: { nickname: nick || 'Player', resumeToken: saved ?? undefined, avatar }, auth: false });
      saveAvatar(avatar); localStorage.setItem(roomKey(code), r.token); localStorage.setItem('cq.nick', r.nickname);
      nav(`/play/${code}`);
    } catch (err) { if (err instanceof ApiError && err.code === 'not_started') void check(); setError(err instanceof ApiError ? err.message : 'Could not join'); setBusy(false); }
  };

  return (
    <Backdrop><main className="container-page max-w-md py-10">
      <Link to="/" className="mb-6 flex items-center gap-2.5 font-brand text-2xl font-extrabold text-white"><Logo light size={34} />{brand.name}</Link>
      {room && room.schedule && !room.schedule.canJoin && room.schedule.startsAt && !saved ? (
        <NotStarted title={room.title} startsAt={room.schedule.startsAt} mode={room.schedule.mode} serverNow={room.schedule.serverNow} what="live quest" onReady={() => void check()} />
      ) : (
      <form className="card animate-rise space-y-4" onSubmit={join}>
        <h1 className="text-3xl">Join a live game</h1>
        {!params.code && <div><label className="label" htmlFor="rc">Room code</label><input id="rc" className="field text-center text-2xlst" inputMode="numeric" value={formatRoomCode(code)} onChange={(e) => setCode(normaliseRoomCode(e.target.value).slice(0, 6))} placeholder="000 000" /></div>}
        {room && <Notice kind="ok"><strong>{room.title}</strong> · {room.style === 'points' ? 'Points' : 'Steps'} · {room.players} joined</Notice>}
        {error && <Notice kind="bad">{error}</Notice>}
        {saved && room ? (
          <p className="hint">You already joined this game on this device. Rejoin to keep your place and score.</p>
        ) : null}
        <div><label className="label" htmlFor="nick">Your nickname</label><input id="nick" className="field" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={20} autoComplete="nickname" required={!saved} /></div>
        <div className="rounded-3xl bg-primary-soft/60 p-3 ring-1 ring-line">
          <div className="flex items-center gap-3">
            <AvatarView avatar={avatar} name={nick} size={60} />
            <div className="min-w-0 flex-1"><p className="font-brand text-lg font-extrabold leading-tight">Your character</p><p className="hint">This is how everyone sees you.</p></div>
            <button type="button" className="btn btn-secondary min-h-10! px-4! text-base!" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>{editing ? 'Done' : 'Customize'}</button>
          </div>
          {editing && <div className="mt-3 border-t border-line pt-3"><AvatarEditor value={avatar} onChange={setAvatar} /></div>}
        </div>
        <button className="btn btn-primary w-full" disabled={busy || !room}>{saved ? 'Rejoin game' : 'Join game'}</button>
      </form>
      )}
    </main></Backdrop>
  );
}
