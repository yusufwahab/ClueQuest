import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Icon, Loading, Notice, PageHead, fmtDate } from '../../components/ui';
import { examPhase } from '../../lib/examPhase';

const STEPS = [
  { n: 1, title: 'Write the questions', text: 'Type them in, add pictures and maths, or let the AI assistant draft them.' },
  { n: 2, title: 'Set the schedule and rules', text: 'When it opens and closes, the time allowed, attempts and results.' },
  { n: 3, title: 'Invite candidates', text: 'Each gets a personal link by email, and the CBT runs itself.' },
];

export default function Exams() {
  const q = useQuery({ queryKey: ['activities'], queryFn: () => api<{ activities: any[] }>('GET', '/activities'), refetchInterval: 15000 });
  const drafts = useQuery({ queryKey: ['exam-drafts'], queryFn: () => api<{ quizzes: any[] }>('GET', '/quizzes?kind=exam') });
  const exams = (q.data?.activities ?? []).filter((a) => a.mode === 'cbt');
  const unfinished = (drafts.data?.quizzes ?? []).filter((d) => !d.has_exam);
  return (
    <div className="space-y-6">
      <PageHead title="Customize CBT" sub="Timed CBTs for named candidates, with a schedule, an attempt limit and results you release." actions={<Link className="btn btn-primary" to="/exams/new">+ Create CBT</Link>} />
      {q.isLoading && <Loading />}
      {q.error && <Notice kind="bad">{(q.error as Error).message}</Notice>}

      {q.data && drafts.data && exams.length === 0 && unfinished.length === 0 && (
        <section className="card space-y-5">
          <div><h2>No CBTs yet</h2><p className="mt-1 text-muted">An CBT has its own questions and its own schedule. It takes three steps.</p></div>
          <ol className="grid gap-3 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl bg-primary-soft p-4">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary font-extrabold text-white">{s.n}</span>
                <p className="mt-2 font-extrabold">{s.title}</p><p className="hint">{s.text}</p>
              </li>
            ))}
          </ol>
          <Link className="btn btn-primary" to="/exams/new">Create your first CBT</Link>
        </section>
      )}

      {(exams.length > 0 || unfinished.length > 0) && (
        <ul className="grid gap-3 md:grid-cols-2">
          {unfinished.map((d) => (
            <li key={d.id} className="card card-link flex flex-col gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2"><span className="chip bg-warn-soft! text-warn!">Draft</span><Icon name="exam" className="h-4 w-4 text-muted" /></div>
                <h2 className="mt-1 break-words"><Link className="hover:underline" to={`/exams/draft/${d.id}`}>{d.title}</Link></h2>
                <p className="hint">{d.question_count} question{d.question_count === 1 ? '' : 's'} · not scheduled yet</p>
              </div>
              <div className="mt-auto"><Link className="btn btn-primary" to={`/exams/draft/${d.id}`}>Continue setting up</Link></div>
            </li>
          ))}
          {exams.map((a) => {
            const p = examPhase(a);
            return (
              <li key={a.id} className="card card-link flex flex-col gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><span className={`chip ${p.tone}`}>{p.label}</span><Icon name="exam" className="h-4 w-4 text-muted" /></div>
                  <h2 className="mt-1 break-words"><Link className="hover:underline" to={`/activities/${a.id}`}>{a.title}</Link></h2>
                  <p className="hint">
                    {a.opensAt ? `Opens ${fmtDate(a.opensAt)}` : 'Open now'}{a.closesAt ? ` · closes ${fmtDate(a.closesAt)}` : ''}
                    {a.durationMinutes ? ` · ${a.durationMinutes} min` : ''}{a.attemptLimit ? ` · ${a.attemptLimit} attempt${a.attemptLimit === 1 ? '' : 's'}` : ''}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{a.access === 'link' ? 'Shareable link · ' : ''}{a.invited} invited · {a.inProgress} in progress · {a.submitted} submitted</p>
                </div>
                <div className="mt-auto"><Link className="btn btn-primary" to={`/activities/${a.id}`}>{a.invited || a.access === 'link' ? 'Manage CBT' : 'Invite candidates'}</Link></div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
