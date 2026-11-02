import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import ActivityForm from '../../components/ActivityForm';
import { CopyField, Loading, Modal, Notice, PageHead } from '../../components/ui';

export default function QuizUse() {
  const { id } = useParams();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['quiz', id], queryFn: () => api('GET', `/quizzes/${id}`) });
  const [partner, setPartner] = useState<boolean | null>(null);
  const [platforms, setPlatforms] = useState(false);
  if (q.isLoading) return <Loading />;
  if (q.error) return <Notice kind="bad">{(q.error as Error).message}</Notice>;
  const allow = partner ?? q.data.allowPartners;
  return (
    <div className="space-y-6">
      <PageHead
        back={{ to: '/quizzes', label: 'My quests' }}
        title={`Use “${q.data.title}”`}
        sub={`Answer three short questions and you get something to share. Uses published version ${q.data.latestVersion}; later edits will not change it.`}
      />
      <section className="card"><ActivityForm quizId={id!} submitLabel="Create and get the link" onCreated={(a) => nav(`/activities/${a.id}`)} /></section>
      <p className="hint">
        Using another learning platform? <button type="button" className="font-bold text-primary underline" onClick={() => setPlatforms(true)}>Share this quest with it</button>
        {allow && <span className="chip ml-2">Sharing on</span>}
      </p>

      {platforms && (
        <Modal title="Share with another platform" onClose={() => setPlatforms(false)}>
          <div className="space-y-4">
            <p className="hint">Connected platforms (for example MSVA) can find this quest and give it to their students as an assignment. Results go back to that platform automatically.</p>
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[#5b3df5]" checked={allow} onChange={async (e) => { setPartner(e.target.checked); await api('PUT', `/quizzes/${id}/partner-access`, { body: { allow: e.target.checked } }); }} />
              <span className="font-semibold">Allow connected platforms to use this quest</span>
            </label>
            <CopyField label="Quest ID" value={id!} hint="Paste this into the other platform when it asks for the quest ID." />
            <button type="button" className="btn btn-primary w-full" onClick={() => setPlatforms(false)}>Done</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
