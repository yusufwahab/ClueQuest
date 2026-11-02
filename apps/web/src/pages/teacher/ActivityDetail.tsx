import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, downloadCsv } from '../../lib/api';
import { CopyButton, CopyField, Icon, Loading, Modal, Notice, PageHead, fmtDate, pct } from '../../components/ui';

const MODE_NAME: Record<string, string> = { solo: 'Solo practice', live: 'Live game', cbt: 'CBT exam' };

export default function ActivityDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['activity', id], queryFn: () => api('GET', `/activities/${id}`), refetchInterval: 8000 });
  const [tab, setTab] = useState<'share' | 'results' | null>(null);
  const [inviting, setInviting] = useState(false);
  const [invitees, setInvitees] = useState('');
  const [sent, setSent] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  if (q.isLoading) return <Loading />;
  if (q.error) return <Notice kind="bad">{(q.error as Error).message}</Notice>;
  const a = q.data;
  const s = a.settings;
  const link = `${location.origin}/q/${a.shareCode}`;
  const refresh = () => qc.invalidateQueries({ queryKey: ['activity', id] });
  const view = tab ?? (a.mode !== 'live' && a.attempts.length > 0 ? 'results' : 'share');

  const invite = async () => {
    const list = invitees.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)[,\s]+([^\s,]+@[^\s,]+)$/); return m ? { name: m[1]!.trim() || m[2]!, email: m[2]! } : null; });
    if (list.some((x) => !x)) return setMsg('Use one candidate per line: Name, email@example.com');
    try { const r = await api('POST', `/activities/${id}/invitations`, { body: { invitees: list } }); setSent(r.invitations); setInvitees(''); setMsg(''); refresh(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Could not send'); }
  };
  const closeInvite = () => { setInviting(false); setSent([]); setMsg(''); };
  const openRoom = async () => { const r = await api('POST', `/activities/${id}/rooms`); nav(`/host/room/${r.code}`); };

  const tabCls = (on: boolean) => `min-h-11 border-b-4 px-4 font-extrabold ${on ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink'}`;
  return (
    <div className="space-y-6">
      <PageHead
        back={{ to: '/quizzes', label: 'My quests' }}
        title={a.title}
        sub={<><span className="chip mr-2">{MODE_NAME[a.mode]}</span><span className="chip mr-2">{a.style === 'points' ? 'Points' : `Steps (wrong answer: ${s.steps?.wrong === 'down' ? 'move down' : 'stay'})`}</span><span className={`chip ${a.status === 'open' ? '' : '!bg-warn-soft !text-warn'}`}>{a.status === 'open' ? 'Open' : 'Closed'}</span></>}
        actions={<button className="btn btn-secondary" onClick={async () => { await api('POST', `/activities/${id}/${a.status === 'open' ? 'close' : 'reopen'}`); refresh(); }}>{a.status === 'open' ? 'Close' : 'Reopen'}</button>}
      />

      {a.partnerId && <Notice kind="info">This activity was launched from a connected platform. Results are delivered to it automatically.</Notice>}

      {a.mode !== 'live' && (
        <div role="tablist" aria-label="Activity" className="flex gap-1 border-b border-line">
          <button role="tab" aria-selected={view === 'share'} className={tabCls(view === 'share')} onClick={() => setTab('share')}>Share</button>
          <button role="tab" aria-selected={view === 'results'} className={tabCls(view === 'results')} onClick={() => setTab('results')}>Results ({a.attempts.length})</button>
        </div>
      )}

      {view === 'share' && a.mode === 'solo' && (
        <section className="card space-y-4">
          <div><h2>Send this link to your learners</h2><p className="hint">They open it, type a name if they like, and play. No account needed.</p></div>
          <CopyField label="Learner link" value={link} openable />
          <p className="hint">Anyone with the link can play, and it does not say who they are. Use an exam, or a connected platform, when results must belong to named students.</p>
        </section>
      )}

      {view === 'share' && a.mode === 'live' && (
        <section className="card space-y-4">
          <div><h2>Start a game</h2><p className="hint">Opening a room gives you a 6-digit code. Players type it at the home page, or you send them a link.</p></div>
          <button className="btn btn-primary w-full sm:w-auto" onClick={openRoom} disabled={a.status !== 'open'}>Open a room</button>
        </section>
      )}

      {view === 'share' && a.mode === 'cbt' && !a.partnerId && (
        <section className="card space-y-4">
          <div><h2>Invite your candidates</h2><p className="hint">Each candidate gets a personal link, so results belong to them. Add them by name and email.</p></div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => setInviting(true)}>Add candidates</button>
            {a.invitations?.length > 0 && <span className="chip self-center">{a.invitations.length} invited</span>}
          </div>
          {s.release === 'manual' && (
            <div className="border-t border-line pt-4">
              <p className="hint mb-2">You chose to release results yourself. Do it when you are ready.</p>
              <button className="btn btn-secondary" onClick={async () => { await api('POST', `/activities/${id}/release`); refresh(); }}>Release all submitted results</button>
            </div>
          )}
        </section>
      )}

      {view === 'results' && a.mode !== 'live' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2>Results</h2>
            <button className="btn btn-secondary" onClick={() => downloadCsv(`/activities/${id}/results.csv`, 'results.csv')}>Download CSV</button>
          </div>
          {a.attempts.length === 0 ? <div className="card text-center"><Icon name="check" className="mx-auto h-8 w-8 text-muted" /><p className="mt-2 text-muted">No one has taken it yet. Results appear here as soon as someone submits.</p><button className="btn btn-primary mt-3" onClick={() => setTab('share')}>Go to sharing</button></div> : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface"><table className="table">
              <thead><tr><th>Who</th><th>Status</th><th>Marks</th><th>%</th><th>{a.style === 'points' ? 'Points' : 'Step'}</th><th>Result</th><th>Submitted</th>{s.release === 'manual' && <th>Released</th>}</tr></thead>
              <tbody>{a.attempts.map((t: any) => (
                <tr key={t.id}>
                  <td>{t.candidate ?? (t.playerName || t.learnerRef || 'Anonymous')}{t.email && <span className="hint block">{t.email}</span>}</td>
                  <td>{t.status === 'submitted' ? (t.autoSubmitted ? 'Auto-submitted' : 'Submitted') : 'In progress'}</td>
                  <td>{t.marksEarned ?? '—'} / {t.marksPossible ?? '—'}</td><td>{pct(t.percent)}</td>
                  <td>{a.style === 'points' ? t.points ?? '—' : t.stepPosition ?? '—'}</td>
                  <td>{t.passed == null ? '—' : t.passed ? 'Pass' : 'Fail'}</td><td>{fmtDate(t.submittedAt)}</td>
                  {s.release === 'manual' && <td>{t.status === 'submitted' ? <button className="btn-quiet" onClick={async () => { await api('POST', `/activities/${id}/attempts/${t.id}/release`, { body: { released: !t.released } }); refresh(); }}>{t.released ? 'Hide' : 'Release'}</button> : '—'}</td>}
                </tr>))}</tbody></table></div>)}
        </section>
      )}

      {inviting && (
        <Modal title={sent.length ? 'Invitations ready' : 'Add candidates'} onClose={closeInvite} wide>
          {sent.length === 0 ? (
            <div className="space-y-3">
              {msg && <Notice kind="bad">{msg}</Notice>}
              <label className="label" htmlFor="cands">One candidate per line: name, then email</label>
              <textarea id="cands" className="field min-h-32" placeholder={'Ada Obi, ada@school.org\nBola Ade, bola@school.org'} value={invitees} onChange={(e) => setInvitees(e.target.value)} />
              <button className="btn btn-primary w-full sm:w-auto" onClick={invite} disabled={!invitees.trim()}>Create invitations</button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="hint">Each link below belongs to one candidate. They are shown only now, so copy them if the emails do not arrive.</p>
              <ul className="space-y-3">{sent.map((i) => (
                <li key={i.email} className="rounded-xl border border-line p-3">
                  <p className="font-bold">{i.name} <span className="hint font-normal">· {i.emailStatus === 'sent' ? 'emailed' : 'link only, not emailed'}</span></p>
                  <div className="mt-2 flex gap-2"><input readOnly aria-label={`Link for ${i.name}`} value={i.url} onFocus={(e) => e.currentTarget.select()} className="field min-w-0 flex-1 text-sm" /><CopyButton value={i.url} what={`link for ${i.name}`} className="btn btn-primary" /></div>
                </li>))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={sent.map((i) => `${i.name}: ${i.url}`).join('\n')} label="Copy all links" what="all links" />
                <button className="btn btn-primary" onClick={closeInvite}>Done</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
