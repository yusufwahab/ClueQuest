import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Loading, Notice, fmtDate } from '../../components/ui';

export default function Quizzes() {
  const q = useQuery({ queryKey: ['quizzes'], queryFn: () => api<{ quizzes: any[] }>('GET', '/quizzes') });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>My quests</h1>
        <Link className="btn btn-primary" to="/quizzes/new">Create quest</Link>
      </div>
      {q.isLoading && <Loading />}
      {q.error && <Notice kind="bad">{(q.error as Error).message}</Notice>}
      {q.data && q.data.quizzes.length === 0 && (
        <div className="card">
          <h2>No quests yet</h2>
          <p className="mt-1 text-muted">Write your first quest on any subject. When you publish it, you can use it for solo practice, a live game, an exam or an assignment.</p>
          <Link className="btn btn-primary mt-4" to="/quizzes/new">Create your first quest</Link>
        </div>
      )}
      {q.data && q.data.quizzes.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-line bg-surface">
          <table className="table">
            <thead><tr><th>Title</th><th>Subject</th><th>Questions</th><th>Status</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {q.data.quizzes.map((x) => (
                <tr key={x.id}>
                  <td className="font-semibold"><Link className="text-primary underline" to={`/quizzes/${x.id}`}>{x.title}</Link></td>
                  <td>{x.subject || '—'}</td>
                  <td>{x.question_count}</td>
                  <td>{x.latest_version ? `Published v${x.latest_version}` : 'Draft'}</td>
                  <td>{fmtDate(x.updated_at)}</td>
                  <td className="whitespace-nowrap">
                    <Link className="btn-quiet" to={`/quizzes/${x.id}/preview`}>Preview</Link>
                    {x.latest_version > 0 && <Link className="btn-quiet" to={`/quizzes/${x.id}/use`}>Use</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
