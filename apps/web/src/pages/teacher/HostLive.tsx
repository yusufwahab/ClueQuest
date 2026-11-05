import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import ActivityForm from '../../components/ActivityForm';
import { Loading, Notice, PageHead } from '../../components/ui';

export default function HostLive() {
  const nav = useNavigate();
  const quizzes = useQuery({ queryKey: ['quizzes'], queryFn: () => api<{ quizzes: any[] }>('GET', '/quizzes') });
  const acts = useQuery({ queryKey: ['activities'], queryFn: () => api<{ activities: any[] }>('GET', '/activities') });
  const [picked, setPicked] = useState('');
  const published = (quizzes.data?.quizzes ?? []).filter((q) => q.latest_version > 0);
  const quizId = picked || (published.length === 1 ? published[0].id : '');
  const chosen = useQuery({ queryKey: ['quiz', quizId], queryFn: () => api('GET', `/quizzes/${quizId}`), enabled: !!quizId });
  const live = (acts.data?.activities ?? []).filter((a) => a.mode === 'live' && a.status === 'open');
  const open = async (activityId: string) => { const r = await api('POST', `/activities/${activityId}/rooms`); nav(`/host/room/${r.code}`); };

  if (quizzes.isLoading) return <Loading />;
  return (
    <div className="space-y-6">
      <PageHead title="Host live game" sub="Pick a quest, choose the scoring, and you get a room code for everyone to join." />
      {published.length === 0 ? (
        <Notice kind="info">You need a published quest first. <Link className="font-semibold underline" to="/quizzes/new">Create one</Link>.</Notice>
      ) : (
        <section className="card space-y-5">
          <div>
            <p className="chip">Step 1</p>
            <label className="label mt-2" htmlFor="quiz">Which quest do you want to play?</label>
            <select id="quiz" className="field" value={quizId} onChange={(e) => setPicked(e.target.value)}>
              <option value="">Choose a published quest</option>
              {published.map((q) => <option key={q.id} value={q.id}>{q.title}{q.subject ? ` (${q.subject})` : ''} — v{q.latest_version}</option>)}
            </select>
          </div>
          {quizId && chosen.isLoading && <Loading />}
          {quizId && chosen.data && <div className="border-t border-line pt-5"><p className="chip mb-3">Step 2</p><ActivityForm key={quizId} quizId={quizId} defaults={chosen.data.play} fixedMode="live" submitLabel="Open room" onCreated={(a) => open(a.id)} /></div>}
        </section>
      )}
      {live.length > 0 && (
        <section className="space-y-2"><h2>Play a game you set up before</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {live.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3"><span><strong>{a.title}</strong> <span className="hint">· {a.style === 'points' ? 'Points' : 'Steps'} · played {a.rooms} time(s)</span></span><button className="btn btn-secondary" onClick={() => open(a.id)}>Open a new room</button></li>)}
          </ul></section>
      )}
    </div>
  );
}
