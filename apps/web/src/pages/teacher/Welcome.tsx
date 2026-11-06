import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { brand } from '@cluequest/config';
import { useAuth } from '../../lib/auth';
import { Backdrop, Icon, Logo } from '../../components/ui';
import { ICON_TONES } from '../../lib/tones';
import { PointsPreview, StepsPreview } from '../../components/FormatPreview';
import { AiMock, ExamMock } from '../../components/ProductMocks';

const OPTIONS: { to: string; title: string; text: string; points: string[]; cta: string; icon: 'plus' | 'live' | 'exam' | 'spark'; tone: string; preview: ReactNode }[] = [
  {
    to: '/quizzes/new', title: 'Create a quest', icon: 'plus', tone: '', cta: 'Create a quest',
    text: 'Write your questions once. Share a link for practice, or play it live.',
    points: ['Pictures and maths in any question', 'Points or Steps scoring', 'Share one link, no accounts for learners'],
    preview: <PointsPreview compact />,
  },
  {
    to: '/host', title: 'Host a Live Quest', icon: 'live', tone: '', cta: 'Host a Live Quest',
    text: 'Run a live game. Players join with a room code and race up the staircase together.',
    points: ['Everyone sees everyone’s step', 'Works on any phone, no sign-up for players', 'You control the pace, question by question'],
    preview: <StepsPreview compact />,
  },
  {
    to: '/exams/new', title: 'Set up a CBT', icon: 'exam', tone: '', cta: 'Set up a CBT',
    text: 'A formal, timed CBT for named candidates, with its own questions and schedule.',
    points: ['Opening time, closing time and a timer', 'Personal invitation links by email', 'Results you release when you are ready'],
    preview: <ExamMock />,
  },
  {
    to: '/quizzes/new?ai=1', title: 'Draft with AI', icon: 'spark', tone: '', cta: 'Try the AI assistant',
    text: 'Tell the assistant a topic and it writes a full set of questions for you to review.',
    points: ['One short form, one click', 'You check and edit every question', 'Free to use'],
    preview: <AiMock />,
  },
];

/** Shown once, right after sign-up: a friendly look at what the platform does, and a way straight into each part of it. */
export default function Welcome() {
  const { user } = useAuth();
  const first = (user?.displayName ?? '').trim().split(/\s+/)[0] || 'there';
  return (
    <Backdrop>
      <main className="container-page py-8 md:py-12">
        <header className="mx-auto max-w-2xl text-center text-white">
          <span className="inline-flex items-center gap-2.5 font-brand text-2xl font-extrabold"><Logo light size={34} />{brand.name}</span>
          <h1 className="mt-6 text-4xl sm:text-5xl">Welcome, {first}!</h1>
          <p className="mt-3 text-lg font-semibold text-white/90">Your account is ready. What would you like to do first? You can do all of these, in any order, whenever you like.</p>
        </header>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {OPTIONS.map((o, i) => (
            <article key={o.to} className="card flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${ICON_TONES[i]}`}><Icon name={o.icon} className="h-6 w-6" /></span>
                <h2 className="text-2xl">{o.title}</h2>
              </div>
              <p className="text-muted">{o.text}</p>
              <ul className="space-y-1 text-sm font-semibold">
                {o.points.map((p) => <li key={p} className="flex items-start gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{p}</li>)}
              </ul>
              <div className="mt-1">{o.preview}</div>
              <Link className="btn btn-primary mt-auto w-full" to={o.to}>{o.cta}</Link>
            </article>
          ))}
        </div>

        <div className="mt-8 text-center text-white">
          <p className="font-semibold text-white/90">Not sure yet? Look around first. Everything is in the menu, and your dashboard shows what to do next.</p>
          <Link className="btn btn-sun mt-3" to="/dashboard">Take me to my dashboard</Link>
        </div>
      </main>
    </Backdrop>
  );
}
