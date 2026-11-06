import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { brand } from '@cluequest/config';
import { ApiError, api } from '../../lib/api';
import { Backdrop, Loading, Logo, Notice, fmtDate } from '../../components/ui';

type Kind = 'solo' | 'invite' | 'launch';
const base = (kind: Kind, key: string) => (kind === 'solo' ? `/public/solo/${key}` : kind === 'invite' ? `/public/invite/${key}` : `/launch/${key}`);

/**
 * The page a learner lands on from a public link, an exam invitation or a partner launch.
 * Opening it only reads information. An attempt is created (or the open one resumed) when the learner presses the button.
 */
export default function Entry({ kind }: { kind: Kind }) {
  const params = useParams();
  const key = params.code ?? params.token ?? '';
  const nav = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [cid, setCid] = useState('');

  useEffect(() => { api('GET', base(kind, key), { auth: false }).then(setInfo).catch(setError); }, [kind, key]);

  const start = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api('POST', `${base(kind, key)}/start`, { body: kind === 'solo' ? { name: name.trim() || undefined, candidateId: cid.trim() || undefined } : {}, auth: false });
      nav(`/attempt/${r.token}`);
    } catch (e) { setError(e as ApiError); setBusy(false); }
  };

  if (info?.mode === 'cbt') {
    const row = (k: string, v: React.ReactNode) => <tr><th scope="row" className="w-2/5">{k}</th><td>{v}</td></tr>;
    const resume = !!info.hasOpenAttempt;
    return (
      <div className="exam">
        <main className="mx-auto max-w-2xl px-4 py-8">
          <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted">{brand.name} · Online examination</p>
          <div className="card space-y-5">
            <div className="border-b border-line pb-3"><h1 className="text-2xl">{info.title}</h1>{info.subject && <p className="hint">{info.subject}</p>}</div>
            <table className="table w-full">
              <tbody>
                {info.candidateName && row('Candidate', <strong>{info.candidateName}</strong>)}
                {info.learnerName && row('Candidate', <strong>{info.learnerName}</strong>)}
                {row('Questions', info.questionCount)}
                {info.durationMinutes && row('Time allowed', `${info.durationMinutes} minutes`)}
                {info.opensAt && row('Opens', fmtDate(info.opensAt))}
                {info.closesAt && row('Closes', fmtDate(info.closesAt))}
                {info.attemptLimit && row('Attempts allowed', `${info.attemptLimit}${info.attemptsUsed != null ? ` (used ${info.attemptsUsed})` : ''}`)}
                {info.passMarkPercent != null && row('Pass mark', `${info.passMarkPercent}%`)}
              </tbody>
            </table>
            {info.instructions && <div><h2 className="text-lg">Instructions</h2><p className="mt-1 whitespace-pre-line">{info.instructions}</p></div>}
            <div>
              <h2 className="text-lg">Before you begin</h2>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>The timer starts when you press Start and cannot be paused. It keeps running if you refresh or close the page.</li>
                <li>Your answers are saved automatically. You can change them until you submit.</li>
                <li>When the time is up, your CBT is submitted for you with the answers saved so far.</li>
              </ul>
            </div>
            {kind === 'solo' && info.status !== 'closed' && (
              <div className="space-y-3 rounded-lg border border-line bg-paper p-4">
                <p className="font-semibold">Enter your details to begin</p>
                <div><label className="label" htmlFor="cname">Full name</label><input id="cname" className="field" value={name} maxLength={60} autoComplete="name" onChange={(e) => setName(e.target.value)} /></div>
                <div><label className="label" htmlFor="cid">Email address or ID number</label><input id="cid" className="field" value={cid} maxLength={100} autoComplete="email" onChange={(e) => setCid(e.target.value)} />
                  <p className="hint mt-1">Used to let you continue if you are disconnected, and to count your attempts.</p></div>
              </div>
            )}
            {error && <Notice kind="bad">{error.message}</Notice>}
            {info.status === 'closed' ? <Notice kind="warn">This CBT is closed.</Notice> : info.canStart === false ? (
              <div className="space-y-2"><Notice kind="warn">You have used all your attempts.</Notice>
                {info.lastAttemptToken && <Link className="btn btn-primary" to={`/attempt/${info.lastAttemptToken}`}>View your result</Link>}
                {info.returnUrl && <a className="btn btn-secondary ml-2" href={info.returnUrl}>Return to class</a>}</div>
            ) : (
              <div className="space-y-3 border-t border-line pt-4">
                {!resume && <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 accent-[#1f3b8a]" checked={ready} onChange={(e) => setReady(e.target.checked)} /><span>I have read the instructions and I am ready to begin.</span></label>}
                <button className="btn btn-primary w-full sm:w-auto" onClick={start} disabled={busy || (!resume && !ready) || (kind === 'solo' && (!name.trim() || cid.trim().length < 3))}>{resume ? 'Resume your attempt' : 'Start'}</button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <Backdrop><main className="container-page max-w-2xl py-8">
      <p className="mb-6 flex items-center gap-2.5 font-brand text-2xl font-extrabold text-white"><Logo light size={34} />{brand.name}</p>
      {!info && !error && <div className="card"><Loading /></div>}
      {error && !info && (
        <div className="card space-y-3">
          <Notice kind="bad">{error.message}</Notice>
          {error.code === 'needs_identity' && <p className="hint">Ask your host for your personal CBT link.</p>}
          {error.code === 'launch_expired' && info?.returnUrl && <a className="btn btn-secondary" href={info.returnUrl}>Return to class</a>}
        </div>
      )}
      {info && (
        <div className="card animate-rise space-y-4">
          <div>
            <h1 className="text-3xl">{info.title}</h1>
            <p className="hint">{info.subject ? `${info.subject} · ` : ''}{info.questionCount} question{info.questionCount === 1 ? '' : 's'}</p>
          </div>
          {info.candidateName && <p>Candidate: <strong>{info.candidateName}</strong></p>}
          {info.learnerName && <p>Learner: <strong>{info.learnerName}</strong></p>}
          {info.instructions && <div><h2>Instructions</h2><p className="whitespace-pre-line">{info.instructions}</p></div>}
          <ul className="list-disc space-y-1 pl-5">
            {info.durationMinutes && <li>You have <strong>{info.durationMinutes} minutes</strong> once you start. The timer runs on the server, so refreshing does not pause it.</li>}
            {info.closesAt && <li>Closes {fmtDate(info.closesAt)}.</li>}
            {info.opensAt && new Date(info.opensAt) > new Date() && <li>Opens {fmtDate(info.opensAt)}.</li>}
            {info.attemptLimit && <li>Attempts allowed: {info.attemptLimit}{info.attemptsUsed != null ? ` (used ${info.attemptsUsed})` : ''}.</li>}
            {info.passMarkPercent != null && <li>Pass mark: {info.passMarkPercent}% of marks.</li>}
            <li>{info.style === 'points' ? 'Scoring: Points for each correct answer, alongside your marks.' : `Scoring: Steps. Each correct answer moves you up a step${info.steps?.wrong === 'down' ? '; a wrong or missing answer moves you down one' : '; a wrong or missing answer keeps you where you are'}.`}</li>
            {info.instantFeedback ? <li>Each answer is checked and locked as soon as you choose it.</li> : <li>Your answers are saved as you go. You can review them before you submit.</li>}
          </ul>
          {error && <Notice kind="bad">{error.message}</Notice>}
          {kind === 'solo' && !info.hasOpenAttempt && (
            <div><label className="label" htmlFor="pname">Your name (optional)</label><input id="pname" className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></div>
          )}
          {info.status === 'closed' ? <Notice kind="warn">This quest is closed.</Notice> : info.canStart === false ? (
            <div className="space-y-2"><Notice kind="warn">You have used all your attempts.</Notice>
              {info.lastAttemptToken && <Link className="btn btn-primary" to={`/attempt/${info.lastAttemptToken}`}>View your result</Link>}
              {info.returnUrl && <a className="btn btn-secondary ml-2" href={info.returnUrl}>Return to class</a>}</div>
          ) : (
            <button className="btn btn-primary w-full sm:w-auto" onClick={start} disabled={busy}>{info.hasOpenAttempt ? 'Resume your attempt' : kind === 'solo' ? 'Start quest' : 'Start'}</button>
          )}
        </div>
      )}
    </main></Backdrop>
  );
}
