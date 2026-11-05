import { useEffect, useState } from 'react';
import { fmtDate, pct } from '../../components/ui';
import { QuestionImage, Rich } from '../../components/Rich';
import { Notice } from '../../components/ui';

/**
 * The CBT exam screens. Deliberately plain and calm: neutral colours, no animation, no game styling, no pop-ups,
 * so it feels like sitting an exam. The look is applied by the `exam` class (see index.css), which re-colours the shared components.
 */

export function clock(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export interface ExamProps {
  view: any; idx: number; setIdx: (i: number) => void; answers: Record<string, string>; choose: (qid: string, oid: string) => void;
  left: number | null; save: 'saved' | 'saving' | 'error'; reviewing: boolean; setReviewing: (b: boolean) => void;
  onReview: () => Promise<void>; submit: () => void; submitting: boolean; error: string;
}

export function ExamAttempt(p: ExamProps) {
  const { view, idx, setIdx, answers, choose, left, save, reviewing, setReviewing, onReview, submit, submitting, error } = p;
  const qs: any[] = view.questions;
  const cur = qs[idx]!;
  const answered = qs.filter((q) => answers[q.id]).length;
  const low = left != null && left <= 300, critical = left != null && left <= 60;

  // Tell screen-reader users at five minutes and at one minute. The ticking timer itself is not announced every second.
  const [announce, setAnnounce] = useState('');
  useEffect(() => { if (left === 300) setAnnounce('Five minutes remaining.'); else if (left === 60) setAnnounce('One minute remaining.'); }, [left]);

  return (
    <div className="exam">
      <header className="sticky top-0 z-10 border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2.5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Examination</p>
            <p className="truncate font-semibold">{view.title}{view.playerName ? <span className="font-normal text-muted"> · {view.playerName}</span> : null}</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted sm:inline" aria-live="polite">{save === 'saving' ? 'Saving…' : save === 'error' ? 'Not saved. Retrying…' : 'All answers saved'}</span>
            {left != null && (
              <div className={`rounded-lg border px-3 py-1 text-right ${critical ? 'border-danger bg-danger-soft text-danger' : low ? 'border-warn bg-warn-soft text-warn' : 'border-line bg-paper'}`}>
                <p className="text-[10px] font-semibold uppercase tracking-wider">Time remaining</p>
                <p className="font-mono text-2xl font-bold tabular-nums leading-tight" role="timer" aria-label={`${clock(left)} remaining`}>{clock(left)}</p>
              </div>
            )}
          </div>
        </div>
      </header>
      <p role="status" aria-live="assertive" className="sr-only">{announce}</p>

      <div className="mx-auto max-w-6xl space-y-4 px-4 py-5">
        {error && <Notice kind="bad">{error}</Notice>}
        {reviewing ? (
          <section aria-label="Review your answers" className="mx-auto max-w-3xl space-y-4">
            <h1 className="text-2xl">Review before you submit</h1>
            {answered < qs.length && <Notice kind="warn">{qs.length - answered} question{qs.length - answered === 1 ? ' is' : 's are'} unanswered. Unanswered questions earn no marks.</Notice>}
            <ol className="divide-y divide-line rounded-lg border border-line bg-white">
              {qs.map((q, i) => (
                <li key={q.id} className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0"><span className="font-semibold">{i + 1}.</span> <span className="break-words"><Rich text={q.text} inline /></span>
                    <span className={`block text-sm ${answers[q.id] ? 'text-accent' : 'font-semibold text-warn'}`}>{answers[q.id] ? <>Answer: <Rich text={q.options.find((o: any) => o.id === answers[q.id])?.text ?? ''} inline /></> : 'Not answered'}</span></span>
                  <button className="btn btn-secondary shrink-0" onClick={() => { setIdx(i); setReviewing(false); }}>Go to question</button>
                </li>
              ))}
            </ol>
            <p className="hint">Once you submit, you cannot change your answers.</p>
            <div className="flex flex-wrap gap-2 pb-4">
              <button className="btn btn-secondary" onClick={() => setReviewing(false)}>Keep answering</button>
              <button className="btn btn-primary" onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit my answers'}</button>
            </div>
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_17rem]">
            <section className="card space-y-4" aria-label={`Question ${idx + 1}`}>
              <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2">
                <p className="font-semibold">Question {idx + 1} of {qs.length}</p>
                <p className="text-sm text-muted">{cur.marks} mark{cur.marks === 1 ? '' : 's'}</p>
              </div>
              <div className="space-y-3 text-lg leading-relaxed"><Rich text={cur.text} /><QuestionImage image={cur.image} /></div>
              <div role="radiogroup" aria-label="Answer options" className="space-y-2">
                {cur.options.map((o: any, oi: number) => {
                  const on = answers[cur.id] === o.id;
                  return (
                    <button key={o.id} role="radio" aria-checked={on} onClick={() => choose(cur.id, o.id)}
                      className={`flex min-h-12 w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${on ? 'border-primary bg-primary-soft' : 'border-line bg-white hover:bg-paper'}`}>
                      <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-primary' : 'border-[#9aa3b2]'}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}</span>
                      <span aria-hidden className="w-5 shrink-0 font-semibold text-muted">{String.fromCharCode(65 + oi)}.</span>
                      <span className="min-w-0 flex-1"><Rich text={o.text} inline /></span>
                    </button>
                  );
                })}
              </div>
              <nav className="flex flex-wrap gap-2 border-t border-line pt-3" aria-label="Question navigation">
                <button className="btn btn-secondary" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Previous</button>
                {idx < qs.length - 1 && <button className="btn btn-primary" onClick={() => setIdx(idx + 1)}>Next</button>}
                <button className={`btn ${idx === qs.length - 1 ? 'btn-primary' : 'btn-secondary'} sm:ml-auto`} onClick={() => void onReview()}>Review and submit</button>
              </nav>
            </section>

            <aside className="card h-fit space-y-3 lg:sticky lg:top-24" aria-label="Question palette">
              <p className="font-semibold">Questions</p>
              <div className="grid grid-cols-5 gap-2" aria-label="Jump to question">
                {qs.map((q, i) => (
                  <button key={q.id} onClick={() => setIdx(i)} aria-label={`Question ${i + 1}${answers[q.id] ? ', answered' : ', not answered'}`} aria-current={i === idx}
                    className={`h-10 rounded-md border text-sm font-semibold ${i === idx ? 'border-primary bg-primary text-white' : answers[q.id] ? 'border-primary bg-primary-soft text-primary' : 'border-line bg-white text-ink hover:bg-paper'}`}>{i + 1}</button>
                ))}
              </div>
              <ul className="space-y-1 text-xs text-muted" aria-hidden>
                <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-primary bg-primary-soft" />Answered</li>
                <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-line bg-white" />Not answered</li>
              </ul>
              <p className="text-sm" aria-live="polite"><strong>{answered}</strong> of {qs.length} answered</p>
              <button className="btn btn-primary w-full" onClick={() => void onReview()}>Finish and review</button>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

/** What a candidate sees after submitting an exam: a plain acknowledgement, then marks once the host has released them. */
export function ExamResult({ view }: { view: any }) {
  const r = view.result;
  return (
    <div className="exam">
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <header className="border-b border-line pb-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Examination</p>
          <h1 className="text-2xl">{view.title}</h1>
          <p className="hint">Submitted {fmtDate(r.submittedAt)}{r.autoSubmitted ? ' automatically when time ran out' : ''}</p>
        </header>
        {!r.released ? <Notice kind="info">{r.message}</Notice> : (
          <>
            <section aria-label="Your marks" className="space-y-3">
              <h2>Your marks</h2>
              <table className="table overflow-hidden rounded-lg border border-line bg-white">
                <tbody>
                  <tr><th scope="row" className="w-1/3">Marks</th><td>{r.marksEarned} / {r.marksPossible}</td></tr>
                  <tr><th scope="row">Percentage</th><td>{pct(r.percent)}</td></tr>
                  <tr><th scope="row">Result</th><td>{r.passed != null ? <strong>{r.passed ? 'Passed' : 'Not passed'}</strong> : 'Recorded'}{r.passed != null && <span className="hint"> · pass mark {r.passMarkPercent}%</span>}</td></tr>
                </tbody>
              </table>
            </section>
            {r.review && (
              <section className="space-y-2"><h2>Review</h2>
                <ol className="space-y-3">{r.review.map((q: any, i: number) => (
                  <li key={q.id} className="card space-y-1">
                    <p className="font-semibold">{i + 1}. <Rich text={q.text} /></p>
                    <QuestionImage image={q.image} className="max-h-40" />
                    <p className={q.correct ? 'text-accent' : 'text-danger'}>{q.correct ? `Correct (+${q.earned} mark${q.earned === 1 ? '' : 's'})` : q.chosen ? 'Not correct' : 'Not answered'}</p>
                    <p className="text-sm">Your answer: {q.chosen ? <Rich text={q.options.find((o: any) => o.id === q.chosen)?.text ?? ''} inline /> : '—'}</p>
                    {!q.correct && <p className="text-sm">Correct answer: <strong><Rich text={q.options.find((o: any) => o.id === q.correctId)?.text ?? ''} inline /></strong></p>}
                    {q.explanation && <p className="hint mt-1"><Rich text={q.explanation} /></p>}
                  </li>))}</ol></section>
            )}
          </>
        )}
        {view.returnUrl && <a className="btn btn-primary" href={view.returnUrl}>Return to class</a>}
      </main>
    </div>
  );
}
