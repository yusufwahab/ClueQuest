import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import ActivityForm from '../../components/ActivityForm';
import { Loading, Notice } from '../../components/ui';

export default function QuizUse() {
  const { id } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['quiz', id], queryFn: () => api('GET', `/quizzes/${id}`) });
  const [partner, setPartner] = useState<boolean | null>(null);
  if (q.isLoading) return <Loading />;
  if (q.error) return <Notice kind="bad">{(q.error as Error).message}</Notice>;
  const allow = partner ?? q.data.allowPartners;
  return (
    <div className="space-y-6">
      <div><h1>Use “{q.data.title}”</h1><p className="hint">Published version {q.data.latestVersion}. Activities you create keep using this version even if you publish changes later.</p></div>
      <section className="card"><ActivityForm quizId={id!} submitLabel="Create activity" onCreated={(a) => nav(`/activities/${a.id}`)} /></section>
      <section className="card space-y-3">
        <h2>Connected platforms</h2>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-[#1f4fd8]" checked={allow} onChange={async (e) => { setPartner(e.target.checked); await api('PUT', `/quizzes/${id}/partner-access`, { body: { allow: e.target.checked } }); }} />
          <span><span className="font-semibold">Let connected learning platforms assign this quest</span>
            <span className="hint block">Platforms can look it up and launch it as an assignment for their students. Quest ID: <code className="select-all">{id}</code></span></span>
        </label>
      </section>
      <Link className="btn-quiet" to={`/quizzes/${id}`}>Back to the editor</Link>
    </div>
  );
}
