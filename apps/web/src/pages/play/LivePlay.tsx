import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useRoom } from '../../lib/useRoom';
import { Standings, Timer, useCountdown } from '../../components/LiveParts';
import { Loading, Notice, OptionBadge, StepTrack } from '../../components/ui';
import { roomKey } from './JoinRoom';

export default function LivePlay() {
  const { code = '' } = useParams();
  const token = localStorage.getItem(roomKey(code)) ?? undefined;
  const { state: s, conn, emit, now } = useRoom(code, { token });
  const left = useCountdown(s?.deadline ?? null, now);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { setPending(null); }, [s?.qIndex]);

  if (!token || conn === 'rejected') return <main className="container-page max-w-md py-10 space-y-3"><Notice kind="warn">You have not joined this game on this device.</Notice><Link className="btn btn-primary" to={`/join/${code}`}>Join the game</Link></main>;
  if (!s) return <Loading what="Joining" />;

  const answer = async (optionId: string) => {
    if (!s.question || s.myAnswer || pending) return;
    setPending(optionId); setErr('');
    const r = await emit('answer', { questionId: s.question.id, optionId });
    if (!r.ok) { setErr(r.error ?? 'Could not send your answer'); setPending(null); }
  };
  const chosen = s.myAnswer ?? pending;
  const me = s.me;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 pb-6">
      <header className="sticky top-0 z-10 -mx-4 border-b border-line bg-paper px-4 py-3">
        <div className="flex items-center justify-between gap-3"><p className="truncate font-semibold">{s.title}</p>
          <p className="text-sm text-muted">{conn === 'online' ? `Room ${s.code}` : 'Reconnecting…'}</p></div>
        {me && s.phase !== 'lobby' && (s.style === 'steps' ? <div className="mt-2"><StepTrack position={me.step} max={s.total} /></div> : <p className="mt-1 font-semibold">Points {me.points} · Marks {me.marks}</p>)}
      </header>
      {conn !== 'online' && <div className="mt-3"><Notice kind="warn">Connection lost. Your answers are safe; reconnecting automatically.</Notice></div>}
      {err && <div className="mt-3"><Notice kind="bad">{err}</Notice></div>}

      <main className="mt-4 flex-1 space-y-4">
        {s.phase === 'lobby' && <div className="card space-y-2"><h1>You are in</h1><p>Waiting for the host to start. {s.playerCount} player{s.playerCount === 1 ? '' : 's'} here.</p><p className="hint">{s.style === 'points' ? 'Points: each correct answer earns its points.' : `Steps: climb one step per correct answer${s.steps.wrong === 'down' ? '; a wrong or missing answer moves you down one.' : '; a wrong or missing answer keeps you where you are.'}`}</p></div>}

        {(s.phase === 'question' || s.phase === 'locked') && s.question && (
          <>
            <p className="hint">Question {s.qIndex + 1} of {s.total}</p>
            {s.phase === 'question' && <Timer left={left} total={s.secondsPerQuestion} />}
            <h1 className="text-2xl">{s.question.text}</h1>
            <div role="radiogroup" aria-label="Answer options" className="space-y-2">
              {s.question.options.map((o, oi) => {
                const isChosen = chosen === o.id; const locked = s.phase === 'locked';
                const tone = locked && o.id === s.question!.correctId ? 'border-accent bg-accent-soft' : locked && isChosen ? 'border-danger bg-danger-soft' : isChosen ? 'border-primary bg-primary-soft' : 'border-[#cfc8f7] bg-surface';
                return <button key={o.id} role="radio" aria-checked={isChosen} disabled={!!chosen || locked} onClick={() => answer(o.id)} className={`opt ${tone}`}><OptionBadge index={oi} /><span>{o.text}{locked && o.id === s.question!.correctId ? ' — correct' : locked && isChosen ? ' — your answer' : ''}</span></button>;
              })}
            </div>
            {s.phase === 'question' && (chosen ? <Notice kind="ok">Answer locked in. Waiting for the others.</Notice> : <p className="hint">Tap an answer. It locks immediately.</p>)}
            {s.phase === 'locked' && (
              <>
                <Notice kind={s.myAnswer === s.question.correctId ? 'ok' : 'warn'}>{s.myAnswer === s.question.correctId ? 'Correct.' : s.myAnswer ? 'Not quite.' : 'No answer in time.'} {s.question.explanation}</Notice>
                <h2>Standings</h2><Standings rows={s.standings} style={s.style} total={s.total} meId={me?.id} />
                <p className="hint">Waiting for the host to continue.</p>
              </>
            )}
          </>
        )}

        {s.phase === 'finished' && (
          <>
            <h1>Final results</h1>
            {me && <div className="card"><p className="text-xl font-bold">You finished #{s.finalStandings?.find((r) => r.id === me.id)?.rank ?? me.rank}</p><p>{s.style === 'points' ? `${me.points} points` : `Step ${me.step} of ${s.total}`} · {me.marks} marks</p></div>}
            <Standings rows={(s.finalStandings ?? []).slice(0, 10)} style={s.style} total={s.total} meId={me?.id} />
            <Link className="btn btn-secondary" to="/">Home</Link>
          </>
        )}
        {s.phase === 'cancelled' && <Notice kind="warn">The host cancelled this game.</Notice>}
      </main>
    </div>
  );
}
