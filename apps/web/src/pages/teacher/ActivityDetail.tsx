import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, downloadCsv } from '../../lib/api';
import { CopyField, Icon, Loading, Modal, Notice, PageHead, fmtDate, pct } from '../../components/ui';
import InviteCandidates from '../../components/InviteCandidates';
import SchedulePanel from '../../components/SchedulePanel';

const MODE_NAME: Record<string, string> = { solo: 'Solo practice', live: 'Live game', cbt: 'CBT' };

export default function ActivityDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['activity', id], queryFn: () => api('GET', `/activities/${id}`), refetchInterval: 8000 });
  const quizInfo = useQuery({ queryKey: ['quiz', q.data?.quizId], queryFn: () => api('GET', `/quizzes/${q.data.quizId}`), enabled: !!q.data && q.data.mode === 'cbt' });
  const [tab, setTab] = useState<'share' | 'results' | null>(null);
  const [inviting, setInviting] = useState(false);
  if (q.isLoading) return <Loading />;
  if (q.error) return <Notice kind="bad">{(q.error as Error).message}</Notice>;
  const a = q.data;
  const s = a.settings;
  const link = `${location.origin}/q/${a.shareCode}`;
  const refresh = () => qc.invalidateQueries({ queryKey: ['activity', id] });
  const view = tab ?? (a.mode !== 'live' && a.attempts.length > 0 ? 'results' : 'share');

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

      {quizInfo.data?.kind === 'exam' && a.attempts.length > 0 && <Notice kind="info">The questions and rules are locked because candidates have started. You can still invite more candidates, close the CBT and release results.</Notice>}
      {a.partnerId && <Notice kind="info">This activity was launched from a connected platform. Results are delivered to it automatically.</Notice>}

      {a.mode !== 'live' && (
        <div role="tablist" aria-label="Activity" className="flex gap-1 border-b border-line">
          <button role="tab" aria-selected={view === 'share'} className={tabCls(view === 'share')} onClick={() => setTab('share')}>Share</button>
          <button role="tab" aria-selected={view === 'results'} className={tabCls(view === 'results')} onClick={() => setTab('results')}>Results ({a.attempts.length})</button>
        </div>
      )}

      {view === 'share' && a.mode !== 'cbt' && !a.partnerId && <SchedulePanel activity={a} onChanged={refresh} />}

      {view === 'share' && a.mode === 'solo' && (
        <section className="card space-y-4">
          <div><h2>Send this link to your learners</h2><p className="hint">They open it, type a name if they like, and play. No account needed.</p></div>
          <CopyField label="Learner link" value={link} openable />
          <p className="hint">Anyone with the link can play, and it does not say who they are. Use a CBT, or a connected platform, when results must belong to named students.</p>
        </section>
      )}

      {view === 'share' && a.mode === 'live' && (
        <section className="card space-y-4">
          <div><h2>Start a game</h2><p className="hint">Opening a room gives you a 6-digit code. Players type it at the home page, or you send them a link.</p></div>
          <button className="btn btn-primary w-full sm:w-auto" onClick={openRoom} disabled={a.status !== 'open'}>Open a room</button>
        </section>
      )}

      {view === 'share' && a.mode === 'cbt' && !a.partnerId && (
        <section className="card space-y-5">
          <div><h2>{s.access === 'link' ? 'Share your CBT' : 'Invite your candidates'}</h2>
            <p className="mt-2 rounded-xl bg-primary-soft/60 p-3 text-sm font-semibold">
              {s.opensAt ? `Opens ${fmtDate(s.opensAt)}` : 'Open now'}{s.closesAt ? ` · closes ${fmtDate(s.closesAt)}` : ' · no closing time'}{s.durationMinutes ? ` · ${s.durationMinutes} minutes each` : ''}{s.attemptLimit ? ` · ${s.attemptLimit} attempt${s.attemptLimit === 1 ? '' : 's'}` : ''}
            </p>
          </div>
          {s.access === 'link' && (
            <CopyField label="CBT link" value={link} openable hint="Send this to your candidates. When they open it they enter their name and an email or ID number, then start. No account needed." />
          )}
          <div className={`space-y-2 ${s.access === 'link' ? 'border-t border-line pt-4' : ''}`}>
            <h3 className="text-lg">{s.access === 'link' ? 'Or invite people by email' : 'Add candidates'}</h3>
            <p className="hint">Each person gets a personal link, so their result is tied to them. Type names and emails side by side, or upload a CSV.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-primary" onClick={() => setInviting(true)}>Add candidates</button>
              {a.invitations?.length > 0 && <span className="chip">{a.invitations.length} invited</span>}
            </div>
          </div>
          {s.release === 'manual' && (
            <div className="border-t border-line pt-4">
              <p className="hint mb-2">You chose to release results yourself. Do it when you are ready.</p>
              <button className="btn btn-secondary" onClick={async () => { await api('POST', `/activities/${id}/release`); refresh(); }}>Release all submitted results</button>
            </div>
          )}
          {quizInfo.data?.kind === 'exam' && a.attempts.length === 0 && (
            <div className="border-t border-line pt-4"><Link className="btn btn-secondary" to={`/exams/${a.id}/edit`}>Edit CBT</Link><p className="hint mt-1">You can change the questions, schedule and rules until the first candidate starts.</p></div>
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
                  <td>{t.candidate ?? (t.playerName || t.learnerRef || 'Anonymous')}{(t.email || (t.playerName && t.learnerRef)) && <span className="hint block break-all">{t.email ?? t.learnerRef}</span>}</td>
                  <td>{t.status === 'submitted' ? (t.autoSubmitted ? 'Auto-submitted' : 'Submitted') : 'In progress'}</td>
                  <td>{t.marksEarned ?? '—'} / {t.marksPossible ?? '—'}</td><td>{pct(t.percent)}</td>
                  <td>{a.style === 'points' ? t.points ?? '—' : t.stepPosition ?? '—'}</td>
                  <td>{t.passed == null ? '—' : t.passed ? 'Pass' : 'Fail'}</td><td>{fmtDate(t.submittedAt)}</td>
                  {s.release === 'manual' && <td>{t.status === 'submitted' ? <button className="btn-quiet" onClick={async () => { await api('POST', `/activities/${id}/attempts/${t.id}/release`, { body: { released: !t.released } }); refresh(); }}>{t.released ? 'Hide' : 'Release'}</button> : '—'}</td>}
                </tr>))}</tbody></table></div>)}
        </section>
      )}

      {inviting && (
        <Modal title="Add candidates" onClose={() => setInviting(false)} wide>
          <InviteCandidates activityId={a.id} onSent={refresh} onDone={() => setInviting(false)} />
        </Modal>
      )}
    </div>
  );
}
