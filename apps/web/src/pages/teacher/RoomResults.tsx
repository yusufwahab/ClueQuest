import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Loading, Notice } from '../../components/ui';

export default function RoomResults() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['room-results', id], queryFn: () => api('GET', `/rooms/${id}/results`) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <Notice kind="bad">{(q.error as Error).message}</Notice>;
  const { room, results } = q.data;
  return (
    <div className="space-y-5">
      <div><h1>{room.title}</h1><p className="hint">Live game · {room.style === 'points' ? 'Points' : 'Steps'}</p></div>
      <div className="overflow-x-auto rounded-md border border-line bg-surface"><table className="table">
        <thead><tr><th>#</th><th>Player</th><th>Marks</th><th>{room.style === 'points' ? 'Points' : 'Final step'}</th><th>Correct</th></tr></thead>
        <tbody>{results.map((r: any) => <tr key={r.id}><td>{r.rank}</td><td>{r.nickname}</td><td>{r.marks} / {r.marksPossible}</td><td>{room.style === 'points' ? r.points : r.step}</td><td>{r.correct}</td></tr>)}</tbody></table></div>
      <Link className="btn-quiet" to="/results">Back to results</Link>
    </div>
  );
}
