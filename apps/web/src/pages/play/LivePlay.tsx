import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatRoomCode } from '@cluequest/game-core';
import { useRoom } from '../../lib/useRoom';
import { Standings, Timer, useCountdown } from '../../components/LiveParts';
import { Loading, Notice, OptionBadge } from '../../components/ui';
import { StepScene } from '../../components/StepScene';
import { AvatarEditor, AvatarView, saveAvatar, type Avatar } from '../../components/Avatar';
import { ChatBox, ReactionBar, ReactionLayer, Roster } from '../../components/RoomSocial';
import { LobbySchedule } from '../../components/Schedule';
import { AnswerPop, Confetti, useAnswerPop } from '../../components/Feedback';
import { QuestionImage, Rich } from '../../components/Rich';
import { roomKey } from './JoinRoom';
import WhatsAppPrompt from '../../components/WhatsAppPrompt';

export default function LivePlay() {
  const { code = '' } = useParams();
  const token = localStorage.getItem(roomKey(code)) ?? undefined;
  const { state: s, conn, emit, now, chat, bursts } = useRoom(code, { token });
  const left = useCountdown(s?.deadline ?? null, now);
  const [pending, setPending] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const [look, setLook] = useState<Avatar | null>(null);
  useEffect(() => { setPending(null); }, [s?.qIndex]);

  // When the host locks a question, tell this player how they did. Only on the live change, so a refresh does not replay old news.
  const [pop, showPop] = useAnswerPop();
  const lastPhase = useRef<string | null>(null);
  const streak = useRef(0);
  useEffect(() => {
    if (!s) return;
    const justLocked = lastPhase.current === 'question' && s.phase === 'locked';
    lastPhase.current = s.phase;
    if (!justLocked || !s.question) return;
    if (!s.myAnswer) { streak.current = 0; showPop('timeout', 'No answer in time'); return; }
    const right = s.myAnswer === s.question.correctId;
    streak.current = right ? streak.current + 1 : 0;
    showPop(right ? 'correct' : 'wrong', right ? (s.style === 'points' ? `+${s.question.points} points` : 'One step up') : s.style === 'steps' && s.steps.wrong === 'down' ? 'One step down' : undefined, streak.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.phase, s?.qIndex]);

  if (!token || conn === 'rejected') return <main className="container-page max-w-md py-10 space-y-3"><Notice kind="warn">You have not joined this game on this device.</Notice><Link className="btn btn-primary" to={`/join/${code}`}>Join the game</Link></main>;
  if (!s) return <Loading what="Joining" />;

  const answer = async (optionId: string) => {
    if (!s.question || s.myAnswer || pending) return;
    setPending(optionId); setErr('');
    const r = await emit('answer', { questionId: s.question.id, optionId });
    if (!r.ok) { setErr(r.error ?? 'Could not send your answer'); setPending(null); }
  };
  const say = async (kind: 'chat' | 'reaction', body: string) => { const r = await emit('say', { kind, body }); return { ok: r.ok, error: r.error }; };
  const saveLook = async () => {
    if (!look) return;
    const r = await emit('avatar', { avatar: look });
    if (r.ok) { saveAvatar(look); setEditing(false); } else setErr(r.error ?? 'Could not save your look');
  };
  const chosen = s.myAnswer ?? pending;
  const me = s.me;
  const mine = s.players.find((p) => p.id === me?.id) ?? null;
  const myLook = mine?.avatar ?? me?.avatar ?? null;
  const others = s.board.filter((b) => b.id !== me?.id);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-4 pb-6">
      <AnswerPop event={pop} />
      <ReactionLayer bursts={bursts} />
      <header className="sticky top-0 z-10 -mx-4 border-b border-line bg-surface/90 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3"><p className="truncate font-semibold">{s.title}</p>
          <p className="text-sm text-muted">{conn === 'online' ? `Room ${formatRoomCode(s.code)}` : 'Reconnecting…'}</p></div>
        {me && s.phase !== 'lobby' && (
          <div className="mt-1.5 flex items-center gap-2.5">
            <AvatarView avatar={myLook} name={me.nickname} size={34} />
            {s.style === 'steps' ? (
              <div role="img" aria-label={`Step ${me.step} of ${s.total}`} className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between text-sm font-bold" aria-hidden><span>Step {me.step} <span className="font-semibold text-muted">of {s.total}</span></span><span className="text-muted">#{me.rank}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-primary-soft" aria-hidden><div className="h-2 rounded-full bg-primary transition-[width] duration-700" style={{ width: `${(me.step / Math.max(1, s.total)) * 100}%` }} /></div>
              </div>
            ) : <p className="font-semibold">Points {me.points} · Marks {me.marks} <span className="text-muted">· #{me.rank}</span></p>}
          </div>
        )}
      </header>
      {conn !== 'online' && <div className="mt-3"><Notice kind="warn">Connection lost. Your answers are safe; reconnecting automatically.</Notice></div>}
      {err && <div className="mt-3"><Notice kind="bad">{err}</Notice></div>}

      <main className="mt-4 flex-1 space-y-4">
        {s.phase === 'lobby' && (
          <>
            <div className="hero-bg relative overflow-hidden rounded-3xl p-5 text-white">
              <div className="relative flex items-center gap-4">
                <AvatarView avatar={myLook} name={me?.nickname} size={72} className="animate-pop" />
                <div className="min-w-0">
                  <h1 className="text-3xl text-white">You are in</h1>
                  <p className="font-semibold text-white/90">Waiting for the host to start. {s.playerCount} player{s.playerCount === 1 ? '' : 's'} here.</p>
                </div>
              </div>
              <div className="relative mt-3"><LobbySchedule schedule={s.schedule} dark /></div>
              <p className="relative mt-3 text-sm text-white/80">{s.style === 'points' ? 'Points: each correct answer earns its points.' : `Steps: climb one step per correct answer${s.steps.wrong === 'down' ? '; a wrong or missing answer moves you down one.' : '; a wrong or missing answer keeps you where you are.'}`}</p>
            </div>

            <section className="card space-y-3" aria-label="Your character">
              <div className="flex items-center justify-between gap-3">
                <h2>Your character</h2>
                <button className="btn btn-secondary min-h-10! px-4! text-base!" aria-expanded={editing} onClick={() => { setLook(myLook); setEditing((v) => !v); }}>{editing ? 'Close' : 'Change my look'}</button>
              </div>
              {editing && look && (
                <>
                  <AvatarEditor value={look} onChange={setLook} />
                  <div className="flex gap-2"><button className="btn btn-primary flex-1" onClick={() => void saveLook()}>Save my look</button></div>
                </>
              )}
            </section>

            <section className="card space-y-3" aria-label="Players in the room">
              <h2>Who is here <span className="chip ml-1">{s.playerCount}</span></h2>
              <Roster players={s.players} meId={me?.id} />
            </section>
          </>
        )}

        {(s.phase === 'question' || s.phase === 'locked') && s.question && (
          <>
            {s.style === 'steps' && (
              <StepScene decorative variant={s.phase === 'locked' ? 'banner' : 'compact'} position={me?.step ?? 0} max={s.total} others={others} heroAvatar={myLook} />
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="hint">Question {s.qIndex + 1} of {s.total}</p>
              <p className="text-sm font-semibold" aria-live="polite"><b>{s.answered}</b> of {s.playerCount} answered</p>
            </div>
            {s.phase === 'question' && <Timer left={left} total={s.secondsPerQuestion} />}
            <h1 className="text-2xl"><Rich text={s.question.text} /></h1>
            <QuestionImage image={s.question.image} />
            <div role="radiogroup" aria-label="Answer options" className="space-y-2">
              {s.question.options.map((o, oi) => {
                const isChosen = chosen === o.id; const locked = s.phase === 'locked';
                const tone = locked && o.id === s.question!.correctId ? 'border-accent bg-accent-soft' : locked && isChosen ? 'border-danger bg-danger-soft' : isChosen ? 'border-primary bg-primary-soft' : 'border-[#cfc8f7] bg-surface';
                const n = s.question!.counts?.[o.id] ?? 0;
                return (
                  <button key={o.id} role="radio" aria-checked={isChosen} disabled={!!chosen || locked} onClick={() => answer(o.id)} className={`opt ${tone}`}>
                    <OptionBadge index={oi} />
                    <span className="min-w-0 flex-1"><Rich text={o.text} inline />{locked && o.id === s.question!.correctId ? ' — correct' : locked && isChosen ? ' — your answer' : ''}</span>
                    {locked && <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold text-muted ring-1 ring-line">{n} chose this</span>}
                  </button>
                );
              })}
            </div>
            {s.phase === 'question' && (chosen ? <Notice kind="ok">Answer locked in. Waiting for the others.</Notice> : <p className="hint">Tap an answer. It locks immediately.</p>)}
            <details className="card !p-3" open={s.phase === 'locked'}>
              <summary className="flex cursor-pointer list-none items-center justify-between font-display font-bold">Players <span className="chip">{s.answered} / {s.playerCount} answered</span></summary>
              <div className="mt-3"><Roster players={s.players} meId={me?.id} showAnswered={s.phase === 'question'} /></div>
            </details>
            {s.phase === 'locked' && (
              <>
                <Notice kind={s.myAnswer === s.question.correctId ? 'ok' : 'warn'}>{s.myAnswer === s.question.correctId ? 'Correct.' : s.myAnswer ? 'Not quite.' : 'No answer in time.'} <Rich text={s.question.explanation ?? ''} /></Notice>
                <h2>Standings</h2><Standings rows={s.standings} style={s.style} total={s.total} meId={me?.id} />
                <p className="hint">Waiting for the host to continue.</p>
              </>
            )}
          </>
        )}

        {s.phase === 'finished' && (
          <>
            <h1>Final results</h1>
            {me && (
              <div className="hero-bg relative overflow-hidden rounded-3xl p-6 text-center text-white shadow-[0_20px_40px_-24px_rgba(58,31,176,0.9)]">
                <Confetti n={18} spread={110} />
                <div className="relative mb-2 flex justify-center"><AvatarView avatar={myLook} name={me.nickname} size={84} className="animate-pop" /></div>
                <p className="relative font-brand text-3xl font-bold">You finished #{s.finalStandings?.find((r) => r.id === me.id)?.rank ?? me.rank}</p>
                <p className="relative mt-1 text-lg font-semibold text-white/90">{s.style === 'points' ? `${me.points} points` : `Step ${me.step} of ${s.total}`} · {me.marks} marks</p>
              </div>
            )}
            <WhatsAppPrompt />
            <Standings rows={s.finalStandings ?? []} style={s.style} total={s.total} meId={me?.id} />
            <Link className="btn btn-secondary" to="/">Home</Link>
          </>
        )}
        {s.phase === 'cancelled' && <Notice kind="warn">The host cancelled this game.</Notice>}

        {s.phase !== 'cancelled' && s.phase !== 'question' && (
          <section className="card space-y-3" aria-label="Chat and reactions">
            <h2>{s.phase === 'lobby' ? 'Say hello' : 'Chat and reactions'}</h2>
            <ReactionBar say={say} />
            <ChatBox messages={chat} say={say} meId={me?.id} enabled={s.chatEnabled} />
          </section>
        )}
      </main>
    </div>
  );
}
