import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { brand } from '@cluequest/config';
import { normaliseRoomCode } from '@cluequest/game-core';
import { useAuth } from '../lib/auth';
import { Icon, Logo } from '../components/ui';
import { PointsPreview, StepsPreview } from '../components/FormatPreview';


const WAYS = [
  { icon: 'solo', title: 'Practice alone', text: 'Share one link. Learners play on their own phone and see their score straight away.', tone: 'bg-primary text-white' },
  { icon: 'live', title: 'Play live', text: 'A room code, a leaderboard that moves, and a whole class racing on one quest.', tone: 'bg-coral text-white' },
  { icon: 'exam', title: 'Sit an exam', text: 'A timer, autosave and a deadline the server enforces. Results when you choose.', tone: 'bg-sky text-ink' },
  { icon: 'link', title: 'Assign from your platform', text: 'Launch it from your learning platform and get each result sent back automatically.', tone: 'bg-sun text-ink' },
] as const;

const STEPS = [
  { n: '1', title: 'Describe it', text: 'Tell the AI assistant the topic, class level and how many questions.' },
  { n: '2', title: 'Review it', text: 'Every question lands in the editor. Change, delete or regenerate anything.' },
  { n: '3', title: 'Share it', text: 'Publish, then pick solo, live or exam and send the link.' },
] as const;

export default function Home() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const clean = normaliseRoomCode(code);
  return (
    <div className="min-h-screen">
      <section className="hero-bg relative overflow-hidden text-white">
        <div aria-hidden className="absolute -right-16 -top-16 h-64 w-64 animate-float rounded-full bg-coral/80" />
        <div aria-hidden className="absolute -bottom-20 left-1/3 h-56 w-56 animate-float rounded-full bg-sky/70 [animation-delay:1.5s]" />
        <div aria-hidden className="absolute left-6 top-40 hidden h-10 w-10 rotate-12 rounded-lg bg-sun lg:block" />
        <header className="container-page relative flex min-h-20 items-center justify-between">
          <span className="flex items-center gap-2 text-xl font-extrabold"><Logo light />{brand.name}</span>
          <nav className="flex items-center gap-2">
            {user ? <Link className="btn btn-sun" to="/quizzes">Open workspace</Link> : <Link className="btn btn-secondary" to="/sign-in">Host sign in</Link>}
          </nav>
        </header>
        <div className="container-page relative grid gap-10 pb-16 pt-6 md:grid-cols-[1.15fr_1fr] md:items-center md:pb-24 md:pt-10">
          <div className="animate-rise">
            <span className="chip !bg-white/20 !text-white">Quizzes that feel like games</span>
            <h1 className="mt-4 text-4xl leading-tight sm:text-5xl">Build a quest once. Use it anywhere.</h1>
            <p className="mt-4 max-w-prose text-lg text-white/90">{brand.tagline}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              {!user && <Link className="btn btn-sun" to="/sign-in?mode=register">Create a host account</Link>}
              <a className="btn btn-secondary" href="#how">See how it works</a>
            </div>
          </div>
          <form className="card animate-rise text-ink md:justify-self-end md:w-full md:max-w-sm" style={{ animationDelay: '0.15s' }} onSubmit={(e) => { e.preventDefault(); if (clean.length === 6) nav(`/join/${clean}`); }} aria-labelledby="join-h">
            <h2 id="join-h">Join a live game</h2>
            <p className="hint mt-1">Your host shows a 6-digit code. No account needed.</p>
            <label className="label mt-4" htmlFor="code">Room code</label>
            <input id="code" className="field text-center text-3xl font-extraboldst" inputMode="numeric" autoComplete="off" placeholder="000 000" value={code} onChange={(e) => setCode(e.target.value)} maxLength={7} />
            <button className="btn btn-primary mt-4 w-full" disabled={clean.length !== 6}>Join game</button>
            <p className="hint mt-4">Have a quest link or exam invitation? Open it directly from your host or class.</p>
          </form>
        </div>
      </section>

      <main>
        <section className="container-page py-14">
          <h2 className="text-3xl">One quest, four ways to use it</h2>
          <p className="mt-2 max-w-prose text-muted">Write the questions once. Choose how learners meet them each time.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WAYS.map((w) => (
              <article key={w.title} className="card flex flex-col gap-3">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${w.tone}`}><Icon name={w.icon} className="h-6 w-6" /></span>
                <h3>{w.title}</h3>
                <p className="text-muted">{w.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="bg-ink text-white">
          <div className="container-page grid gap-10 py-14 md:grid-cols-2 md:items-center">
            <div>
              <span className="chip !bg-sun !text-ink"><Icon name="spark" className="mr-1 h-4 w-4" />AI assistant</span>
              <h2 className="mt-4 text-3xl">Let the assistant write the first draft</h2>
              <p className="mt-3 max-w-prose text-white/80">Fill in a short form. It builds the title, instructions and every question with answers, ready for you to check. You stay in charge: nothing is shared until you publish.</p>
            </div>
            <ol className="space-y-3">
              {STEPS.map((s) => (
                <li key={s.n} className="flex gap-4 rounded-2xl bg-white/10 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sun text-lg font-extrabold text-ink">{s.n}</span>
                  <div><h3>{s.title}</h3><p className="text-white/80">{s.text}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="container-page py-14">
          <h2 className="text-3xl">Points or Steps. You choose.</h2>
          <p className="mt-2 max-w-2xl text-muted">Same questions, two ways to play. Pick one for each game, and see below what players see.</p>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <article className="card flex flex-col">
              <span className="chip self-start">Race for the top score</span>
              <h3 className="mt-2 text-2xl">Points</h3>
              <p className="mt-1 text-muted">Each question is worth what you set, for example 50 for an easy one and 200 for a hard one. Right answers add up. Wrong or missed answers earn nothing.</p>
              <div className="mt-5"><PointsPreview animate /></div>
              <p className="hint mt-auto pt-3">Best for quick rounds, quizzes with hard and easy questions, and a clear winner.</p>
            </article>
            <article className="card flex flex-col">
              <span className="chip self-start">Climb the staircase</span>
              <h3 className="mt-2 text-2xl">Steps</h3>
              <p className="mt-1 text-muted">Climb one step for each right answer. If a learner misses, they either stay put or slide down one, as you decide. They never drop below the start.</p>
              <div className="mt-5"><StepsPreview animate /></div>
              <p className="hint mt-auto pt-3">Best for whole classes, because everyone can see everyone's step and nobody is left far behind.</p>
            </article>
          </div>
          <p className="mt-6 text-muted">Either way, school marks are tracked separately, so a game result never changes a grade.</p>
        </section>
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="container-page flex min-h-16 items-center justify-between text-sm text-muted"><span className="flex items-center gap-2 font-bold text-ink"><Logo size={24} />{brand.name}</span><span>Build once. Play anywhere.</span></div>
      </footer>
    </div>
  );
}
