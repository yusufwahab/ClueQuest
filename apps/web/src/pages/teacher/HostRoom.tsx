import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatRoomCode } from '@cluequest/game-core';
import { teacherToken } from '../../lib/api';
import { useRoom } from '../../lib/useRoom';
import { Standings, Timer, useCountdown } from '../../components/LiveParts';
import { Loading, Notice } from '../../components/ui';

export default function HostRoom() {
  const { code = '' } = useParams();
  const { state: s, conn, emit, now } = useRoom(code, { accessToken: teacherToken() ?? undefined });
  const [err, setErr] = useState('');
  const left = useCountdown(s?.deadline ?? null, now);
  const cmd = async (c: string, playerId?: string) => { setErr(''); const r = await emit('host', { cmd: c, playerId }); if (!r.ok) setErr(r.error ?? 'Failed'); };
  const joinUrl = `${location.origin}/join/${code}`;

  if (conn === 'rejected') return <Notice kind="bad">This room is not available to you.</Notice>;
  if (!s) return <Loading what="Connecting" />;
  const last = s.qIndex + 1 >= s.total;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1>{s.title}</h1><p className="hint">{s.style === 'points' ? 'Points' : `Steps (wrong: ${s.steps.wrong === 'down' ? 'move down' : 'stay'})`} · {s.total} questions · {s.secondsPerQuestion}s each</p></div>
        <div className="text-right"><p className="hint">Room code</p><p className="text-4xl font-bold tracking-widest" aria-label={`Room code ${code.split('').join(' ')}`}>{formatRoomCode(code)}</p></div>
      </div>
      {conn !== 'online' && <Notice kind="warn">Reconnecting… the game keeps running on the server.</Notice>}
      {err && <Notice kind="bad">{err}</Notice>}

      {s.phase === 'lobby' && (
        <section className="card space-y-3">
          <h2>Lobby — {s.playerCount} joined</h2>
          <p>Players join at <strong>{location.host}</strong> with the code, or open <code className="select-all break-all">{joinUrl}</code></p>
          <ul className="flex flex-wrap gap-2">{s.players?.map((p) => <li key={p.id} className="rounded-md border border-line bg-paper px-3 py-1.5">{p.nickname} <button className="ml-2 text-sm text-danger underline" onClick={() => cmd('kick', p.id)} aria-label={`Remove ${p.nickname}`}>remove</button></li>)}</ul>
          <div className="flex gap-2"><button className="btn btn-primary" disabled={s.playerCount === 0} onClick={() => cmd('start')}>Start first question</button><button className="btn btn-secondary" onClick={() => cmd('end')}>Cancel game</button></div>
        </section>
      )}

      {(s.phase === 'question' || s.phase === 'locked') && s.question && (
        <section className="card space-y-4">
          <p className="hint">Question {s.qIndex + 1} of {s.total}</p>
          <h2 className="text-2xl">{s.question.text}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">{s.question.options.map((o) => {
            const correct = s.phase === 'locked' && o.id === s.question!.correctId;
            return <li key={o.id} className={`rounded-md border-2 px-4 py-3 ${correct ? 'border-accent bg-accent-soft font-semibold' : 'border-line'}`}>{o.text}{correct ? ' — correct' : ''}{s.phase === 'locked' && <span className="hint block">{s.question!.counts?.[o.id] ?? 0} chose this</span>}</li>;
          })}</ul>
          {s.phase === 'question' && <Timer left={left} total={s.secondsPerQuestion} />}
          <p aria-live="polite"><strong>{s.answered}</strong> of {s.playerCount} answered</p>
          {s.phase === 'locked' && s.question.explanation && <Notice kind="info">{s.question.explanation}</Notice>}
          <div className="flex gap-2">
            {s.phase === 'question' && <button className="btn btn-primary" onClick={() => cmd('lock')}>Lock answers now</button>}
            {s.phase === 'locked' && <button className="btn btn-primary" onClick={() => cmd('next')}>{last ? 'Show final results' : 'Next question'}</button>}
            <button className="btn btn-secondary" onClick={() => cmd('end')}>End game</button>
          </div>
        </section>
      )}
      {s.phase === 'locked' && <section className="space-y-2"><h2>Standings</h2><Standings rows={s.standings} style={s.style} total={s.total} /></section>}

      {s.phase === 'finished' && (
        <section className="space-y-3"><h2>Final results</h2>
          <Standings rows={s.finalStandings ?? []} style={s.style} total={s.total} />
          <Link className="btn btn-secondary" to="/results">All results</Link></section>
      )}
      {s.phase === 'cancelled' && <Notice kind="warn">This game was cancelled.</Notice>}
    </div>
  );
}
