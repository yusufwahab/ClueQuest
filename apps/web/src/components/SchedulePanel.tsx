import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { Modal, Notice } from './ui';
import { ScheduleFields, fromLocalInput, scheduleLine, toLocalInput, type StartMode } from './Schedule';

/** The host's view of when a solo or live quest starts: the plan in a sentence, a way to change it, and a button to open a manual practice link. */
export default function SchedulePanel({ activity, onChanged }: { activity: any; onChanged: () => void }) {
  const s = activity.settings ?? {};
  const mode: StartMode = s.startMode ?? 'instant';
  const [editing, setEditing] = useState(false);
  const [m, setM] = useState<StartMode>(mode);
  const [at, setAt] = useState(toLocalInput(s.startsAt));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = !!s.startedAt;
  const waiting = mode !== 'instant' && !started && !(mode === 'auto' && s.startsAt && Date.parse(s.startsAt) <= Date.now());

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await api('PATCH', `/activities/${activity.id}/schedule`, { body: { startMode: m, startsAt: m === 'instant' ? null : fromLocalInput(at) } }); setEditing(false); onChanged(); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not save'); } finally { setBusy(false); }
  };
  const openNow = async () => { setBusy(true); try { await api('POST', `/activities/${activity.id}/open-now`); onChanged(); } finally { setBusy(false); } };

  return (
    <section className="card space-y-3" aria-label="Schedule">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2>Schedule</h2>
          <p className="mt-1 font-semibold">{started && mode !== 'instant' ? 'You opened it. It is open now.' : scheduleLine(mode, s.startsAt)}</p>
          {waiting && activity.mode === 'solo' && <p className="hint mt-1">Until then, anyone who opens the link is told when it starts.</p>}
          {waiting && activity.mode === 'live' && <p className="hint mt-1">Open a room below and share its code. Anyone who joins early is told when it starts, and can wait in the lobby in the last 10 minutes.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {activity.mode === 'solo' && mode === 'manual' && !started && <button className="btn btn-primary" disabled={busy || activity.status !== 'open'} onClick={() => void openNow()}>Open it now</button>}
          <button className="btn btn-secondary" onClick={() => { setM(mode); setAt(toLocalInput(s.startsAt)); setError(''); setEditing(true); }}>Change schedule</button>
        </div>
      </div>
      {editing && (
        <Modal title="Change the schedule" onClose={() => setEditing(false)}>
          <form className="space-y-4" onSubmit={save}>
            {error && <Notice kind="bad">{error}</Notice>}
            <ScheduleFields mode={m} at={at} onMode={setM} onAt={setAt} noun={activity.mode === 'live' ? 'The game' : 'The link'} />
            <div className="flex gap-2"><button className="btn btn-primary" disabled={busy}>Save schedule</button><button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button></div>
          </form>
        </Modal>
      )}
    </section>
  );
}
