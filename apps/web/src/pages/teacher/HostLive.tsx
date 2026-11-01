import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import ActivityForm from '../../components/ActivityForm';
import { Loading, Notice } from '../../components/ui';

export default function HostLive() {
  const nav = useNavigate();
  const quizzes = useQuery({ queryKey: ['quizzes'], queryFn: () => api<{ quizzes: any[] }>('GET', '/quizzes') });
  const acts = useQuery({ queryKey: ['activities'], queryFn: () => api<{ activities: any[] }>('GET', '/activities') });
  const [quizId, setQuizId] = useState('');
  const published = (quizzes.data?.quizzes ?? []).filter((q) => q.latest_version > 0);
  const live = (acts.data?.activities ?? []).filter((a) => a.mode === 'live' && a.status === 'open');
  const open = async (activityId: string) => { const r = await api('POST', `/activities/${activityId}/rooms`); nav(`/host/room/${r.code}`); };

  if (quizzes.isLoading) return <Loading />;
  return (
    <div className="space-y-6">
      <h1>Host live game</h1>
      {published.length === 0 ? (
        <Notice kind="info">You need a published quest first. <Link className="font-semibold underline" to="/quizzes/new">Create one</Link>.</Notice>
      ) : (
        <section className="card space-y-4">
          <h2>Start a new game</h2>
          <div><label className="label" htmlFor="quiz">Quest</label>
            <select id="quiz" className="field" value={quizId} onChange={(e) => setQuizId(e.target.value)}>
              <option value="">Choose a published quest</option>
              {published.map((q) => <option key={q.id} value={q.id}>{q.title}{q.subject ? ` (${q.subject})` : ''} — v{q.latest_version}</option>)}
            </select></div>
          {quizId && <ActivityForm key={quizId} quizId={quizId} fixedMode="live" submitLabel="Open room" onCreated={(a) => open(a.id)} />}
        </section>
      )}
      {live.length > 0 && (
        <section className="space-y-2"><h2>Reuse a setup</h2>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {live.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><span><strong>{a.title}</strong> <span className="hint">· {a.style === 'points' ? 'Points' : 'Steps'} · {a.rooms} room(s)</span></span><button className="btn btn-secondary" onClick={() => open(a.id)}>Open a new room</button></li>)}
          </ul></section>
      )}
    </div>
  );
}
