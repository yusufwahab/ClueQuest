import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { brand } from '@cluequest/config';
import { normaliseRoomCode } from '@cluequest/game-core';
import { useAuth } from '../lib/auth';
import { Icon, Logo } from '../components/ui';
import { PointsPreview, StepsPreview } from '../components/FormatPreview';
import { ExamMock } from '../components/ProductMocks';
import { InstallPrompt } from '../components/InstallPrompt';

const NAV = [['How it works', '#how'], ['Ways to use it', '#ways'], ['What’s inside', '#inside'], ['FAQ', '#faq']] as const;

const STATS = [
  { value: '3', label: 'ways to run every set' },
  { value: '150', label: 'players in one live room' },
  { value: '0', label: 'accounts needed to join' },
];

const STEPS: { title: string; text: string }[] = [
  { title: 'Write your questions', text: 'Type them in, add pictures and maths, or give the AI assistant a topic and get a full draft to review.' },
  { title: 'Choose how to run it', text: 'Send a practice link, open a Live Quest with a room code, or customize a CBT and share its link.' },
  { title: 'Watch it, then review it', text: 'See players climb the staircase live or answers arrive, then read every result and download a CSV.' },
];

const WAYS: { icon: 'solo' | 'live' | 'exam'; title: string; lead: string; text: string; points: string[]; visual: ReactNode }[] = [
  {
    icon: 'solo', title: 'Practice quests', lead: 'Practise on their own time',
    text: 'Share one link and people practise on their phones, with instant feedback and a score at the end. You see every attempt.',
    points: ['Points or Steps scoring', 'Instant feedback, or review at the end', 'No sign-up for learners'],
    visual: <PointsPreview compact />,
  },
  {
    icon: 'live', title: 'Live Quests', lead: 'A game the whole room plays together',
    text: 'Open a room, share the 6-digit code and run the quest live. After every question, everyone sees where everyone stands.',
    points: ['Up to 150 players per room', 'You control the pace', 'Instant “Nice, correct!” reactions'],
    visual: <StepsPreview compact />,
  },
  {
    icon: 'exam', title: 'Customize CBT', lead: 'Build your own computer-based test',
    text: 'Create your own CBT: write its questions and set the schedule and timer. You get a link to share, candidates open it, enter their name and write the test. You can also invite people by email.',
    points: ['One shareable link, or personal invites by email', 'Add candidates in bulk from a CSV', 'Release results when you decide'],
    visual: <ExamMock />,
  },
];

const INSIDE: { title: string; text: string }[] = [
  { title: 'Pictures and maths', text: 'Add a picture to any question and write equations properly, with a symbol picker.' },
  { title: 'AI question drafting', text: 'Give a topic and get a full draft. You check every question before it is shared.' },
  { title: 'Points or Steps', text: 'Race for the top score or climb a staircase. Marks are always tracked separately.' },
  { title: 'A live staircase', text: 'Every player’s position, live, on the host’s screen and on every phone.' },
  { title: 'Autosave and resume', text: 'Answers save as candidates go and survive a refresh or a dropped connection.' },
  { title: 'Fair by design', text: 'Options are shuffled per person, and a CBT’s questions lock once anyone has started.' },
  { title: 'Results and CSV', text: 'Review every attempt question by question, and download a CSV for your records.' },
  { title: 'Connect your platform', text: 'Launch quizzes or CBTs from your own platform and get each result back automatically.' },
];

const FAQ: { q: string; a: ReactNode }[] = [
  { q: 'Who can use ClueQuest?', a: 'Anyone. Create a host account and you can run practice quizzes, live games and CBTs for a classroom, a training session, a club, a community event or just a quiz night with friends.' },
  { q: 'Do players need an account?', a: 'No. Players open a link or type a room code. Only hosts, who create quests and CBTs, have accounts.' },
  { q: 'How does a Live Quest work?', a: 'You open a room and share the 6-digit code. Players join on their phones, every question goes to everyone at once, and after each one the staircase shows where every player stands. Up to 150 players can join a room.' },
  { q: 'How does Customize CBT work, and how is it kept fair?', a: 'You create your own CBT: write its questions, set the schedule and a time limit, and a link is generated for you to share or copy. Candidates open it, enter their name and an email or ID, and write the test. You can also invite people by email, one by one or by uploading a CSV, so each gets a personal link. The timer runs on the server, answers save automatically, options are shuffled per candidate, attempts are limited, and the questions are locked once the first candidate starts. ClueQuest does not use webcams or lock-down software, so for high-stakes tests use it for supervised sittings.' },
  { q: 'What can I put in a question?', a: 'Multiple choice with one correct answer, plus a picture, maths (written between dollar signs, with a symbol picker), marks and an explanation. The AI assistant can draft a whole set from a topic.' },
  { q: 'Can I connect my learning platform?', a: 'Yes. A learning platform can launch a quest or CBT as an assignment and receive each result back automatically as a signed message that is retried if it is missed.' },
  { q: 'Does it cost anything to start?', a: 'You can create a host account and try everything without entering any payment details.' },
];

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-display text-sm font-extrabold uppercase tracking-[0.2em] text-sun">{children}</p>;
}
function Tick({ children }: { children: ReactNode }) {
  return <li className="flex items-start gap-2"><Icon name="check" className="mt-1 h-4 w-4 shrink-0 text-sun" /><span>{children}</span></li>;
}
function Arrow() {
  return <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-ink text-sun"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>;
}

export default function Home() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const clean = normaliseRoomCode(code);
  const start = user ? { to: '/dashboard', label: 'Open your dashboard' } : { to: '/sign-in?mode=register', label: 'Create free account' };

  return (
    <div className="relative min-h-screen overflow-x-clip bg-[#0d0836] text-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:font-bold focus:text-ink">Skip to the content</a>

      {/* A glass pill that floats over the page */}
      <header className="sticky top-3 z-40 px-3 pt-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 rounded-full bg-white/[0.07] py-1.5 pl-3 pr-1.5 ring-1 sm:gap-3 sm:py-2 sm:pl-5 sm:pr-2 ring-white/15 backdrop-blur-xl">
          <Link to="/" className="flex min-w-0 shrink items-center gap-1.5 font-brand text-lg font-extrabold text-white sm:gap-2 sm:text-xl"><Logo light size={32} />{brand.name}</Link>
          <nav aria-label="Sections" className="hidden items-center gap-7 lg:flex">
            {NAV.map(([label, href]) => <a key={href} href={href} className="font-display text-[0.95rem] font-semibold text-white/75 transition hover:text-white">{label}</a>)}
          </nav>
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
            {user ? <Link className="btn btn-sun min-h-10! rounded-full! px-5! text-base!" to="/dashboard">Dashboard</Link> : (
              <>
                <Link className="inline-flex min-h-10 items-center whitespace-nowrap rounded-full px-2.5 font-display text-sm font-semibold text-white/90 sm:px-3 sm:text-base transition hover:bg-white/10" to="/sign-in">Sign in</Link>
                <Link className="btn btn-sun min-h-10! whitespace-nowrap rounded-full! px-3.5! text-sm! sm:px-4! sm:text-base!" to="/sign-in?mode=register">Get started</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative -mt-[4.5rem] overflow-hidden pb-16 pt-32 lg:pb-24 lg:pt-40">
        <div aria-hidden className="pointer-events-none absolute -left-40 top-10 h-[34rem] w-[34rem] rounded-full bg-primary/40 blur-[130px]" />
        <div aria-hidden className="pointer-events-none absolute -right-32 top-0 h-[30rem] w-[30rem] rounded-full bg-[#7a3cff]/35 blur-[130px]" />
        <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky/15 blur-[110px]" />
        <div className="container-page relative grid items-center gap-10 lg:grid-cols-[1.02fr_1fr]">
          <div className="animate-rise">
            <h1 className="text-[2rem] font-extrabold leading-[1.08] tracking-tight text-white min-[380px]:text-[2.4rem] sm:text-6xl lg:text-[2.7rem] xl:text-[3.1rem]">
              <span className="block">Create <span className="text-sun">quizzes</span>,</span>{' '}
              <span className="block">host <span className="text-sun">live games</span></span>{' '}
              <span className="block">and customize <span className="text-sun">CBT</span>.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/75">
              Write your questions once, then share a <b className="font-bold text-white">practice link</b>, play <b className="font-bold text-white">live with a room code</b>, or run a timed <b className="font-bold text-white">CBT</b>. <b className="font-bold text-white">No app, no account</b> for players.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link className="btn btn-sun rounded-full! py-2! pl-7! pr-2!" to={start.to}>{start.label}<Arrow /></Link>
              <a className="inline-flex min-h-12 items-center gap-2.5 rounded-full px-5 font-display text-lg font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/10" href="#how">
                <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 text-sun" fill="currentColor"><path d="M7 4.5v15l13-7.5z" /></svg>See how it works
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-white/80">
              <li className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-sun" />No payment details</li>
              <li className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-sun" />Works in any phone browser</li>
            </ul>
            <dl className="mt-10 grid max-w-lg grid-cols-3 divide-x divide-white/15">
              {STATS.map((s, i) => (
                <div key={s.label} className={i === 0 ? 'pr-4' : 'px-4'}>
                  <dt className="font-brand text-3xl font-extrabold text-sun sm:text-4xl">{s.value}</dt>
                  <dd className="mt-1 text-xs font-semibold leading-snug text-white/70 sm:text-sm">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative mx-auto w-full max-w-xl animate-rise lg:max-w-none" style={{ animationDelay: '0.15s' }}>
            <img
              src="/hero-visual.webp"
              srcSet="/hero-visual-sm.webp 800w, /hero-visual.webp 1400w"
              sizes="(min-width: 1024px) 560px, 90vw"
              width={1400} height={1315} alt="ClueQuest on a laptop and a phone: a live staircase race, a practice quiz and a timed CBT"
              fetchPriority="high"
              className="h-auto w-full drop-shadow-[0_30px_60px_rgba(8,4,40,0.6)]"
            />
          </div>
        </div>
      </section>

      {/* Joining a game is the one thing a visitor without an account does, so it sits right under the hero */}
      <div className="container-page relative z-10 pb-16">
        <form className="mx-auto flex max-w-3xl flex-col gap-3 rounded-3xl bg-white/[0.07] p-4 ring-1 ring-white/15 backdrop-blur sm:flex-row sm:items-center sm:p-5" onSubmit={(e) => { e.preventDefault(); if (clean.length === 6) nav(`/join/${clean}`); }} aria-labelledby="join-h">
          <div className="sm:flex-1"><h2 id="join-h" className="text-xl font-extrabold text-white">Join a live game</h2><p className="text-sm text-white/70">Your host shows a 6-digit code. No account needed.</p></div>
          <label className="sr-only" htmlFor="code">Room code</label>
          <input id="code" className="field text-center text-2xl font-extrabold sm:w-48" inputMode="numeric" autoComplete="off" placeholder="000 000" value={code} onChange={(e) => setCode(e.target.value)} maxLength={7} />
          <button className="btn btn-sun rounded-full!" disabled={clean.length !== 6}>Join game</button>
        </form>
      </div>

      <main id="main">
        <section id="how" className="scroll-mt-24 py-16">
          <div className="container-page">
            <div className="max-w-2xl"><Eyebrow>How it works</Eyebrow><h2 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">From questions to results in three steps</h2><p className="mt-3 text-lg text-white/70">You write the questions once. Everything after that is a choice about how people meet them.</p></div>
            <ol className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex flex-col gap-3 rounded-3xl bg-white/[0.06] p-6 ring-1 ring-white/10">
                  <span aria-hidden className="grid h-11 w-11 place-items-center rounded-xl bg-sun font-brand text-xl font-extrabold text-ink">{i + 1}</span>
                  <h3 className="text-xl font-bold text-white">{s.title}</h3>
                  <p className="text-white/70">{s.text}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8"><Link className="btn btn-sun rounded-full! py-2! pl-7! pr-2!" to={start.to}>{start.label}<Arrow /></Link></div>
          </div>
        </section>

        <section id="ways" className="scroll-mt-24 py-16">
          <div className="container-page">
            <div className="max-w-2xl"><Eyebrow>Ways to use it</Eyebrow><h2 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">One set of questions, three ways to run it</h2><p className="mt-3 text-lg text-white/70">Practise alone, play together, or set a formal CBT. Pick the one that fits the moment.</p></div>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {WAYS.map((w) => (
                <article key={w.title} className="flex flex-col overflow-hidden rounded-3xl bg-white/[0.06] ring-1 ring-white/10">
                  <div aria-hidden className="m-3 flex min-h-[15rem] items-center justify-center rounded-2xl bg-gradient-to-b from-primary-soft to-white p-5 text-ink"><div className="w-full max-w-xs">{w.visual}</div></div>
                  <div className="flex flex-1 flex-col gap-3 p-6 pt-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sun/15 text-sun"><Icon name={w.icon} className="h-5 w-5" /></span>
                      <div><h3 className="text-2xl font-extrabold leading-tight text-white">{w.title}</h3><p className="text-sm font-semibold text-sun">{w.lead}</p></div>
                    </div>
                    <p className="text-white/70">{w.text}</p>
                    <ul className="mt-auto space-y-1.5 border-t border-white/10 pt-3 text-sm font-semibold text-white/90">{w.points.map((p) => <Tick key={p}>{p}</Tick>)}</ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="inside" className="scroll-mt-24 py-16">
          <div className="container-page">
            <div className="max-w-2xl"><Eyebrow>What is inside</Eyebrow><h2 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">Everything you need to teach, test and play</h2><p className="mt-3 text-lg text-white/70">Built so a first quiz takes minutes and a formal CBT still feels dependable.</p></div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {INSIDE.map((f, i) => (
                <article key={f.title} className="flex flex-col gap-2 rounded-3xl bg-white/[0.06] p-5 ring-1 ring-white/10">
                  <span aria-hidden className="grid h-11 w-11 place-items-center rounded-xl bg-sun font-brand text-xl font-extrabold text-ink">{i + 1}</span>
                  <h3 className="mt-1 text-lg font-bold text-white">{f.title}</h3>
                  <p className="text-sm text-white/70">{f.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 py-16">
          <div className="container-page grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div><Eyebrow>FAQ</Eyebrow><h2 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">Questions people ask</h2><p className="mt-3 text-lg text-white/70">The short answers, before you sign up.</p></div>
            <div className="space-y-3">
              {FAQ.map((f) => (
                <details key={f.q} className="group rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 open:bg-white/[0.09] open:ring-sun/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-display text-lg font-bold text-white">{f.q}<span aria-hidden className="text-2xl text-sun transition group-open:rotate-45">+</span></summary>
                  <p className="mt-3 text-white/75">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="container-page py-16">
          <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary to-[#7a3cff] px-6 py-14 text-center ring-1 ring-white/20 sm:px-12">
            <div aria-hidden className="pointer-events-none absolute -left-10 -top-16 h-56 w-56 rounded-full bg-sun/30 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-20 right-4 h-60 w-60 rounded-full bg-sky/30 blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Ready to run your first quest?</h2>
              <p className="mx-auto mt-3 max-w-xl text-lg text-white/85">Create a host account in a minute, write a few questions, and share the link. Everyone else needs nothing but a phone.</p>
              <div className="mt-7 flex flex-wrap justify-center gap-3"><Link className="btn btn-sun rounded-full! py-2! pl-7! pr-2!" to={start.to}>{start.label}<Arrow /></Link><a className="inline-flex min-h-12 items-center rounded-full px-6 font-display text-lg font-semibold text-white ring-1 ring-white/40 transition hover:bg-white/10" href="#how">See how it works</a></div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="container-page flex flex-wrap items-center justify-between gap-4 py-6 text-sm text-white/65">
          <span className="flex items-center gap-2 font-brand text-lg font-extrabold text-white"><Logo size={24} light />{brand.name}</span>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1">
            <Link className="hover:text-sun" to="/sign-in?mode=register">Create a host account</Link>
            <Link className="hover:text-sun" to="/sign-in">Host sign in</Link>
            <Link className="hover:text-sun" to="/join">Join a live game</Link>
          </nav>
          <span>© {new Date().getFullYear()} {brand.name}</span>
        </div>
      </footer>
      <InstallPrompt />
    </div>
  );
}
