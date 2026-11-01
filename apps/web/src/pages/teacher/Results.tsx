import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Loading, Notice, fmtDate } from '../../components/ui';

const MODE: Record<string, string> = { solo: 'Solo practice', live: 'Live game', cbt: 'CBT exam' };

export default function Results() {
  const q = useQuery({ queryKey: ['results'], queryFn: () => api<{ activities: any[]; rooms: any[] }>('GET', '/results') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <Notice kind="bad">{(q.error as Error).message}</Notice>;
  const acts = q.data!.activities.filter((a) => a.mode !== 'live');
  const rooms = q.data!.rooms;
  return (
    <div className="space-y-8">
      <h1>Results</h1>
      <section className="space-y-2"><h2>Solo links, exams and assignments</h2>
        {acts.length === 0 ? <p className="text-muted">Nothing yet. Create a quest, publish it, then choose “Use”.</p> : (
          <div className="overflow-x-auto rounded-md border border-line bg-surface"><table className="table">
            <thead><tr><th>Activity</th><th>Type</th><th>Style</th><th>Submitted</th><th>In progress</th><th>Created</th></tr></thead>
            <tbody>{acts.map((a) => <tr key={a.id}><td className="font-semibold"><Link className="text-primary underline" to={`/activities/${a.id}`}>{a.title}</Link> <span className="hint">v{a.quizVersion}</span></td><td>{MODE[a.mode]}</td><td>{a.style === 'points' ? 'Points' : 'Steps'}</td><td>{a.submitted}</td><td>{a.inProgress}</td><td>{fmtDate(a.createdAt)}</td></tr>)}</tbody></table></div>)}
      </section>
      <section className="space-y-2"><h2>Live games</h2>
        {rooms.length === 0 ? <p className="text-muted">No live games yet.</p> : (
          <div className="overflow-x-auto rounded-md border border-line bg-surface"><table className="table">
            <thead><tr><th>Game</th><th>Style</th><th>Players</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>{rooms.map((r) => <tr key={r.id}><td className="font-semibold">{r.phase === 'finished' ? <Link className="text-primary underline" to={`/results/room/${r.id}`}>{r.title}</Link> : r.title}</td><td>{r.style === 'points' ? 'Points' : 'Steps'}</td><td>{r.players}</td><td>{r.phase === 'finished' ? 'Finished' : r.phase === 'cancelled' ? 'Cancelled' : <Link className="text-primary underline" to={`/host/room/${r.code}`}>Open ({r.phase})</Link>}</td><td>{fmtDate(r.createdAt)}</td></tr>)}</tbody></table></div>)}
      </section>
    </div>
  );
}
