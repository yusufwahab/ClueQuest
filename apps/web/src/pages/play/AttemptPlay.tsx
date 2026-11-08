import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { ApiError, api } from '../../lib/api';
import { Loading, Notice, OptionBadge, Stat, fmtDate, pct } from '../../components/ui';
import { StepScene } from '../../components/StepScene';
import WhatsAppPrompt from '../../components/WhatsAppPrompt';
import { AnswerPop, ScoreCard, useAnswerPop } from '../../components/Feedback';
import { QuestionImage, Rich } from '../../components/Rich';
import { ExamAttempt, ExamResult } from './ExamLayout';

type SaveState = 'saved' | 'saving' | 'error';

function fmtClock(sec: number) {
  const m = Math.floor(sec / 60); const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AttemptPlay() {
  const { token = '' } = useParams();
  const [view, setView] = useState<any>(null);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [judged, setJudged] = useState<Record<string, any>>({});
  const [idx, setIdx] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [save, setSave] = useState<SaveState>('saved');
  const [left, setLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pop, showPop] = useAnswerPop();
  const streak = useRef(0);
  const skew = useRef(0);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  /** Instant-feedback answers still travelling to the server; Submit waits for them so the last click is never lost. */
  const inFlight = useRef<Set<Promise<unknown>>>(new Set());
  /** Always the latest answers, set synchronously in handlers so a save never sends a stale copy. */
  const setAnswersNow = (next: Record<string, string>) => { answersRef.current = next; setAnswers(next); };

  const load = useCallback(async () => {
    try {
      const v = await api('GET', '/attempts/me', { attempt: token });
      skew.current = new Date(v.serverNow).getTime() - Date.now();
      setView(v);
      if (v.status === 'in_progress') { answersRef.current = v.answers ?? {}; setAnswers(answersRef.current); setJudged(v.judged ?? {}); }
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load'); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  // Server-enforced countdown: the client only displays it. At zero we re-read so the server's auto-submit shows up.
  useEffect(() => {
    if (!view?.deadline || view.status !== 'in_progress') return;
    const end = new Date(view.deadline).getTime();
    const tick = () => {
      const s = Math.max(0, Math.ceil((end - (Date.now() + skew.current)) / 1000));
      setLeft(s);
      if (s === 0) { setTimeout(() => void load(), 1200); }
    };
    tick(); const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [view?.deadline, view?.status, load]);

  /**
   * Saves the answers. Saves run one at a time, in order, so a slow earlier save can never land after a newer one and undo it.
   * "Unsaved" is cleared before sending, so an answer chosen while a save is in flight is still marked unsaved and gets its own save.
   */
  const chain = useRef<Promise<boolean>>(Promise.resolve(true));
  const flush = useCallback((): Promise<boolean> => {
    const run = async () => {
      if (!dirty.current) return true;
      dirty.current = false;
      setSave('saving');
      try {
        await api('PUT', '/attempts/me/answers', { attempt: token, body: { answers: answersRef.current } });
        setSave(dirty.current ? 'saving' : 'saved'); return true;
      } catch (e) {
        dirty.current = true;
        if (e instanceof ApiError && e.status === 409) { void load(); return false; }
        setSave('error'); return false;
      }
    };
    chain.current = chain.current.then(run, run);
    return chain.current;
  }, [token, load]);

  const choose = (qid: string, oid: string) => {
    if (view.instantFeedback) {
      if (judged[qid]) return;
      setAnswersNow({ ...answersRef.current, [qid]: oid });
      const p = api('POST', '/attempts/me/answer', { attempt: token, body: { questionId: qid, optionId: oid } })
        .then((r) => {
          setJudged(r.judgedAll); setAnswersNow(r.answers);
          const j = r.judged; const q = view.questions.find((x: any) => x.id === qid);
          streak.current = j.correct ? streak.current + 1 : 0;
          showPop(j.correct ? 'correct' : 'wrong', j.correct ? (view.style === 'points' ? `+${q?.points ?? 0} points` : 'One step up') : view.style === 'steps' && j.stepTo < j.stepFrom ? 'One step down' : undefined, streak.current);
        })
        .catch((e) => setError(e.message))
        .finally(() => inFlight.current.delete(p));
      inFlight.current.add(p);
      return;
    }
    setAnswersNow({ ...answersRef.current, [qid]: oid }); dirty.current = true; setSave('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 500);
  };
  // Retry failed autosaves while the page is open.
  useEffect(() => { if (save !== 'error') return; const t = setInterval(() => void flush(), 4000); return () => clearInterval(t); }, [save, flush]);

  const submit = async () => {
    setSubmitting(true);
    if (timer.current) clearTimeout(timer.current);
    await Promise.allSettled([...inFlight.current]);
    await flush();
    try { const v = await api('POST', '/attempts/me/submit', { attempt: token }); setView(v); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not submit'); } finally { setSubmitting(false); }
  };

  if (error && !view) return <main className="container-page max-w-2xl py-10"><Notice kind="bad">{error}</Notice></main>;
  if (!view) return <Loading />;
  if (view.status === 'submitted') return view.mode === 'cbt' ? <ExamResult view={view} /> : <ResultView view={view} />;

  const qs: any[] = view.questions;
  const cur = qs[idx]!;
  const answeredCount = qs.filter((q) => answers[q.id]).length;
  const timed = view.deadline != null;
  const position = view.style === 'steps' && view.instantFeedback ? Math.max(0, ...Object.values(judged).map((j: any) => j.stepTo), 0) : null;
  const lastJudged = qs.map((q) => judged[q.id]).filter(Boolean).pop();
  const stepNow = lastJudged ? lastJudged.stepTo : 0;

  const onReview = async () => { await Promise.allSettled([...inFlight.current]); await flush(); setReviewing(true); };
  // Timed exams get the plain, calm layout. Everything else (practice, games) keeps the playful one.
  if (view.mode === 'cbt') return <ExamAttempt view={view} idx={idx} setIdx={setIdx} answers={answers} choose={choose} left={left} save={save} reviewing={reviewing} setReviewing={setReviewing} onReview={onReview} submit={submit} submitting={submitting} error={error} />;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-4 pb-4">
      <AnswerPop event={pop} />
      <header className="sticky top-0 z-10 -mx-4 border-b border-line bg-surface/90 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate font-semibold">{view.title}</p>
          {timed && left != null && <p className={`rounded-sm px-2 py-1 text-lg font-bold tabular-nums ${left <= 60 ? 'bg-danger text-white' : 'bg-ink text-white'}`} role="timer" aria-label={`${fmtClock(left)} remaining`}>{fmtClock(left)}</p>}
        </div>
        <p className="hint" aria-live="polite">{reviewing ? 'Review' : `Question ${idx + 1} of ${qs.length}`} · {answeredCount} answered{!view.instantFeedback && ` · ${save === 'saving' ? 'Saving…' : save === 'error' ? 'Not saved — retrying' : 'Saved'}`}</p>
      </header>
      {error && <div className="mt-3"><Notice kind="bad">{error}</Notice></div>}

      {reviewing ? (
        <section className="mt-4 flex-1 space-y-4" aria-label="Review your answers">
          <h1>Review before you submit</h1>
          {answeredCount < qs.length && <Notice kind="warn">{qs.length - answeredCount} question{qs.length - answeredCount === 1 ? ' is' : 's are'} unanswered. Unanswered questions earn no marks.</Notice>}
          <ol className="divide-y divide-line rounded-md border border-line bg-surface">
            {qs.map((q, i) => (
              <li key={q.id} className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0"><span className="font-semibold">{i + 1}.</span> <span className="break-words"><Rich text={q.text} inline /></span>
                  <span className={`block text-sm ${answers[q.id] ? 'text-accent' : 'font-semibold text-warn'}`}>{answers[q.id] ? <>Answer: <Rich text={q.options.find((o: any) => o.id === answers[q.id])?.text ?? ''} inline /></> : 'Not answered'}</span></span>
                <button className="btn btn-secondary shrink-0" onClick={() => { setIdx(i); setReviewing(false); }}>Go to question</button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2 safe-bottom">
            <button className="btn btn-secondary" onClick={() => setReviewing(false)}>Keep answering</button>
            <button className="btn btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit my answers'}</button>
          </div>
        </section>
      ) : (
        <section className="mt-4 flex-1 space-y-4">
          {idx === 0 && view.instructions && !Object.keys(answers).length && <Notice kind="info">{view.instructions}</Notice>}
          <p className="hint">{cur.marks} mark{cur.marks === 1 ? '' : 's'}{view.style === 'points' ? ` · ${cur.points} points` : ''}</p>
          <h1 className="text-2xl"><Rich text={cur.text} /></h1>
          <QuestionImage image={cur.image} />
          <div role="radiogroup" aria-label="Answer options" className="space-y-2">
            {cur.options.map((o: any, oi: number) => {
              const j = judged[cur.id];
              const chosen = answers[cur.id] === o.id;
              const tone = j && o.id === j.correctId ? 'border-accent bg-accent-soft' : j && chosen ? 'border-danger bg-danger-soft' : chosen ? 'border-primary bg-primary-soft' : 'border-[#cfc8f7] bg-surface hover:border-primary';
              return (
                <button key={o.id} role="radio" aria-checked={chosen} disabled={!!j} onClick={() => choose(cur.id, o.id)} className={`opt ${tone}`}>
                  <OptionBadge index={oi} /><span><Rich text={o.text} inline />{j && o.id === j.correctId ? ' — correct' : j && chosen ? ' — not correct' : ''}</span>
                </button>
              );
            })}
          </div>
          {judged[cur.id]?.explanation && <Notice kind="info">{judged[cur.id].explanation}</Notice>}
          {view.instantFeedback && view.style === 'steps' && <StepScene variant="compact" position={position != null ? stepNow : 0} max={view.questionCount} />}
          <nav className="flex flex-wrap gap-2 pt-2 safe-bottom" aria-label="Question navigation">
            <button className="btn btn-secondary" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Previous</button>
            {idx < qs.length - 1 ? <button className="btn btn-primary" onClick={() => setIdx(idx + 1)}>Next</button> : null}
            <button className={`btn ${idx === qs.length - 1 ? 'btn-primary' : 'btn-secondary'} sm:ml-auto`} onClick={async () => { await Promise.allSettled([...inFlight.current]); await flush(); setReviewing(true); }}>Review and submit</button>
          </nav>
          <div className="flex flex-wrap gap-1" aria-label="Jump to question">
            {qs.map((q, i) => <button key={q.id} onClick={() => setIdx(i)} aria-label={`Question ${i + 1}${answers[q.id] ? ', answered' : ''}`} aria-current={i === idx} className={`h-10 w-10 rounded-sm border-2 text-sm font-semibold ${i === idx ? 'border-ink bg-ink text-white' : answers[q.id] ? 'border-primary bg-primary-soft' : 'border-line bg-surface'}`}>{i + 1}</button>)}
          </div>
        </section>
      )}
    </div>
  );
}

function ResultView({ view }: { view: any }) {
  const r = view.result;
  return (
    <main className="container-page max-w-2xl space-y-5 py-8">
      <div><h1>{view.title}</h1><p className="hint">Submitted {fmtDate(r.submittedAt)}{r.autoSubmitted ? ' automatically when time ran out' : ''}</p></div>
      {!r.released ? <Notice kind="info">{r.message}</Notice> : (
        <>
          <section aria-label="Your marks" className="space-y-3">
            <h2>Your marks</h2>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Marks" value={`${r.marksEarned} / ${r.marksPossible}`} sub={pct(r.percent)} />
              {r.passed != null ? <Stat label="Result" value={r.passed ? 'Passed' : 'Not passed'} sub={`Pass mark ${r.passMarkPercent}%`} /> : <Stat label="Result" value="Recorded" />}
            </div>
          </section>
          <section aria-label="Game score" className="space-y-3">
            {r.style === 'points' ? <ScoreCard points={r.points} possible={r.pointsPossible} /> : <><h2>Steps</h2><StepScene position={r.stepPosition} max={r.stepMax} /></>}
            <p className="hint">Points and steps are a game score. Your pass or fail depends on marks only.</p>
          </section>
          {view.mode !== 'cbt' && <WhatsAppPrompt />}
          {r.review && (
            <section className="space-y-2"><h2>Review</h2>
              <ol className="space-y-3">{r.review.map((q: any, i: number) => (
                <li key={q.id} className="card">
                  <p className="font-semibold">{i + 1}. <Rich text={q.text} /></p>
                  <QuestionImage image={q.image} className="max-h-40" />
                  <p className={q.correct ? 'text-accent' : 'text-danger'}>{q.correct ? `Correct (+${q.earned} mark${q.earned === 1 ? '' : 's'})` : q.chosen ? 'Not correct' : 'Not answered'}</p>
                  <p className="text-sm">Your answer: {q.chosen ? <Rich text={q.options.find((o: any) => o.id === q.chosen)?.text ?? ''} inline /> : '—'}</p>
                  {!q.correct && <p className="text-sm">Correct answer: <strong><Rich text={q.options.find((o: any) => o.id === q.correctId)?.text ?? ''} inline /></strong></p>}
                  {q.explanation && <p className="hint mt-1">{q.explanation}</p>}
                </li>))}</ol></section>
          )}
        </>
      )}
      {view.returnUrl && <a className="btn btn-primary" href={view.returnUrl}>Return to class</a>}
    </main>
  );
}
