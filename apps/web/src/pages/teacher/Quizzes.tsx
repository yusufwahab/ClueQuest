import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Loading, Notice, PageHead, fmtDate } from '../../components/ui';

const HOW = [
  { n: 1, title: 'Write it', text: 'Add your questions, or let the AI assistant draft them.' },
  { n: 2, title: 'Publish it', text: 'Check it, then publish. You can still edit later.' },
  { n: 3, title: 'Share it', text: 'Pick solo link, live game or exam, and copy the link or code.' },
];

export default function Quizzes() {
  const q = useQuery({ queryKey: ['quizzes'], queryFn: () => api<{ quizzes: any[] }>('GET', '/quizzes') });
  const list = q.data?.quizzes ?? [];
  return (
    <div className="space-y-6">
      <PageHead title="My quests" sub="Everything you have written. Open one to share it." actions={<Link className="btn btn-primary" to="/quizzes/new">+ Create quest</Link>} />
      {q.isLoading && <Loading />}
      {q.error && <Notice kind="bad">{(q.error as Error).message}</Notice>}

      {q.data && list.length === 0 && (
        <section className="card space-y-5">
          <div><h2>Welcome. Let’s make your first quest.</h2><p className="mt-1 text-muted">It takes three steps, and you do each one once.</p></div>
          <ol className="grid gap-3 sm:grid-cols-3">
            {HOW.map((s) => (
              <li key={s.n} className="rounded-2xl bg-primary-soft p-4">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-primary font-extrabold text-white">{s.n}</span>
                <p className="mt-2 font-extrabold">{s.title}</p><p className="hint">{s.text}</p>
              </li>
            ))}
          </ol>
          <Link className="btn btn-primary" to="/quizzes/new">Create your first quest</Link>
        </section>
      )}

      {list.length > 0 && (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map((x) => {
            const live = x.latest_version > 0;
            return (
              <li key={x.id} className="card flex flex-col gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`chip ${live ? '' : '!bg-warn-soft !text-warn'}`}>{live ? 'Published' : 'Draft'}</span>
                    {x.subject && <span className="hint">{x.subject}</span>}
                  </div>
                  <h2 className="mt-1 break-words"><Link className="hover:underline" to={`/quizzes/${x.id}`}>{x.title}</Link></h2>
                  <p className="hint">{x.question_count} question{x.question_count === 1 ? '' : 's'} · updated {fmtDate(x.updated_at)}</p>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {live
                    ? <Link className="btn btn-primary" to={`/quizzes/${x.id}/use`}>Share or play</Link>
                    : <Link className="btn btn-primary" to={`/quizzes/${x.id}`}>Finish and publish</Link>}
                  {live && <Link className="btn btn-secondary" to={`/quizzes/${x.id}`}>Edit</Link>}
                  <Link className="btn-quiet" to={`/quizzes/${x.id}/preview`}>Preview</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
