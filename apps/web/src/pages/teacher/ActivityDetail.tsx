import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, downloadCsv } from '../../lib/api';
import { Loading, Notice, fmtDate, pct } from '../../components/ui';

export default function ActivityDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['activity', id], queryFn: () => api('GET', `/activities/${id}`), refetchInterval: 8000 });
  const [invitees, setInvitees] = useState('');
  const [sent, setSent] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  if (q.isLoading) return <Loading />;
  if (q.error) return <Notice kind="bad">{(q.error as Error).message}</Notice>;
  const a = q.data;
  const s = a.settings;
  const link = `${location.origin}/q/${a.shareCode}`;
  const refresh = () => qc.invalidateQueries({ queryKey: ['activity', id] });

  const invite = async () => {
    const list = invitees.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^(.*?)[,\s]+([^\s,]+@[^\s,]+)$/); return m ? { name: m[1]!.trim() || m[2]!, email: m[2]! } : null; });
    if (list.some((x) => !x)) return setMsg('Use one candidate per line: Name, email@example.com');
    try { const r = await api('POST', `/activities/${id}/invitations`, { body: { invitees: list } }); setSent(r.invitations); setInvitees(''); setMsg(''); refresh(); }
    catch (e) { setMsg(e instanceof ApiError ? e.message : 'Could not send'); }
  };
  const openRoom = async () => { const r = await api('POST', `/activities/${id}/rooms`); nav(`/host/room/${r.code}`); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1>{a.title}</h1><p className="hint">{({ solo: 'Solo practice', live: 'Live game', cbt: 'CBT exam' } as any)[a.mode]} · {a.style === 'points' ? 'Points' : `Steps (wrong answer: ${s.steps?.wrong === 'down' ? 'move down' : 'stay'})`} · quest v{a.quizVersion} · {a.status}</p></div>
        <div className="flex gap-2">
          {a.mode !== 'live' && <button className="btn btn-secondary" onClick={() => downloadCsv(`/activities/${id}/results.csv`, 'results.csv')}>Download CSV</button>}
          <button className="btn btn-secondary" onClick={async () => { await api('POST', `/activities/${id}/${a.status === 'open' ? 'close' : 'reopen'}`); refresh(); }}>{a.status === 'open' ? 'Close' : 'Reopen'}</button>
        </div>
      </div>

      {a.mode === 'solo' && (
        <section className="card space-y-2"><h2>Share this link</h2>
          <input className="field" readOnly value={link} aria-label="Public solo link" onFocus={(e) => e.currentTarget.select()} />
          <p className="hint">Anyone with this link can play. It does not identify who they are, so use an assignment launch or exam invitations when results must belong to named students.</p></section>
      )}
      {a.mode === 'live' && (
        <section className="card space-y-2"><h2>Host a game</h2><p className="hint">Each room gets its own code. Players join from the home page or a link.</p>
          <button className="btn btn-primary" onClick={openRoom} disabled={a.status !== 'open'}>Open a room</button></section>
      )}
      {a.mode === 'cbt' && !a.partnerId && (
        <section className="card space-y-3"><h2>Invite candidates</h2>
          <p className="hint">One per line: Name, email. Each gets a personal link, so results belong to them. In this environment emails are only logged; the links are listed below so you can copy them.</p>
          {msg && <Notice kind="bad">{msg}</Notice>}
          <textarea className="field min-h-28" aria-label="Candidates" placeholder={'Ada Obi, ada@school.org\nBola Ade, bola@school.org'} value={invitees} onChange={(e) => setInvitees(e.target.value)} />
          <button className="btn btn-primary" onClick={invite} disabled={!invitees.trim()}>Create invitations</button>
          {sent.length > 0 && <ul className="space-y-1 text-sm">{sent.map((i) => <li key={i.email}><strong>{i.name}</strong> ({i.emailStatus === 'sent' ? 'emailed' : 'link only'}): <code className="select-all break-all">{i.url}</code></li>)}</ul>}
          <div className="flex gap-2"><button className="btn btn-secondary" onClick={async () => { await api('POST', `/activities/${id}/release`); refresh(); }}>Release all submitted results</button></div>
          {a.invitations?.length > 0 && <p className="hint">{a.invitations.length} candidate(s) invited.</p>}
        </section>
      )}
      {a.partnerId && <Notice kind="info">This activity was launched from a connected platform. Results are delivered to it automatically.</Notice>}

      {a.mode !== 'live' && (
        <section className="space-y-2"><h2>Attempts ({a.attempts.length})</h2>
          {a.attempts.length === 0 ? <p className="text-muted">No attempts yet.</p> : (
            <div className="overflow-x-auto rounded-md border border-line bg-surface"><table className="table">
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
    </div>
  );
}
