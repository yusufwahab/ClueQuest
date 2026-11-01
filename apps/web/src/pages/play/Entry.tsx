import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { brand } from '@cluequest/config';
import { ApiError, api } from '../../lib/api';
import { Loading, Notice, fmtDate } from '../../components/ui';

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

  useEffect(() => { api('GET', base(kind, key), { auth: false }).then(setInfo).catch(setError); }, [kind, key]);

  const start = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api('POST', `${base(kind, key)}/start`, { body: kind === 'solo' ? { name: name.trim() || undefined } : {}, auth: false });
      nav(`/attempt/${r.token}`);
    } catch (e) { setError(e as ApiError); setBusy(false); }
  };

  return (
    <main className="container-page max-w-2xl py-8">
      <p className="mb-6 text-xl font-bold">{brand.name}</p>
      {!info && !error && <Loading />}
      {error && !info && (
        <div className="space-y-3">
          <Notice kind="bad">{error.message}</Notice>
          {error.code === 'needs_identity' && <p className="hint">Ask your host for your personal exam link.</p>}
          {error.code === 'launch_expired' && info?.returnUrl && <a className="btn btn-secondary" href={info.returnUrl}>Return to class</a>}
        </div>
      )}
      {info && (
        <div className="card space-y-4">
          <div>
            <h1>{info.title}</h1>
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
    </main>
  );
}
