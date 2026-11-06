import { limits } from '@cluequest/config';
import { Field } from './ui';
import QuestionMedia from './QuestionMedia';
import { Rich, hasMath } from './Rich';

/** The question-writing screen shared by quests and exams: one question at a time, with a strip to jump between them. */
export interface Opt { id: string; text: string }
export interface Q { id: string; text: string; options: Opt[]; correctId: string; marks: number; points: number; explanation: string; image?: { id: string; alt: string; url?: string | null } | null }

export const uid = () => Math.random().toString(36).slice(2, 10);
export const newQuestion = (): Q => { const a = uid(), b = uid(); return { id: uid(), text: '', options: [{ id: a, text: '' }, { id: b, text: '' }], correctId: a, marks: 1, points: 100, explanation: '', image: null }; };
export const isBlank = (x: Q) => !x.text.trim() || x.options.some((o) => !o.text.trim());

export default function QuestionsEditor({ questions, qi, setQi, onEdit, mode = 'quest' }: {
  questions: Q[]; qi: number; setQi: (i: number) => void; onEdit: (fn: (qs: Q[]) => void) => void; mode?: 'quest' | 'exam';
}) {
  const cur = Math.min(qi, questions.length - 1);
  const q = questions[cur]!;
  const total = questions.reduce((n, x) => n + (Number(x.marks) || 0), 0);
  const setQ = (i: number, fn: (q: Q) => void) => onEdit((qs) => fn(qs[i]!));
  const addQuestion = () => { onEdit((qs) => { qs.push(newQuestion()); }); setQi(questions.length); };
  const exam = mode === 'exam';

  return (
    <section className="space-y-4" aria-label="Questions">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h2>Questions ({questions.length})</h2><p className="hint">Total marks: {total}</p></div>
      <nav aria-label="Jump to a question" className="flex flex-wrap gap-2">
        {questions.map((x, i) => (
          <button key={x.id} type="button" onClick={() => setQi(i)} aria-label={`Go to question ${i + 1}${isBlank(x) ? ' (unfinished)' : ''}`} aria-current={i === cur ? 'true' : undefined}
            className={`grid h-11 w-11 place-items-center rounded-xl border-2 font-extrabold ${i === cur ? 'border-primary bg-primary text-white' : isBlank(x) ? 'border-sun bg-warn-soft' : 'border-accent bg-accent-soft'}`}>{i + 1}</button>
        ))}
        <button type="button" className="h-11 rounded-xl border-2 border-dashed border-primary px-3 font-bold text-primary disabled:opacity-40" disabled={questions.length >= limits.maxQuestions} onClick={addQuestion}>+ Add question</button>
      </nav>

      <fieldset key={q.id} className="card space-y-4">
        <legend className="sr-only">Question {cur + 1} of {questions.length}</legend>
        <p aria-hidden className="chip">Question {cur + 1} of {questions.length}</p>
        <Field label="Question" htmlFor={`q-${q.id}`}><textarea id={`q-${q.id}`} className="field min-h-20" value={q.text} onChange={(e) => setQ(cur, (x) => { x.text = e.target.value; })} maxLength={1000} /></Field>
        <QuestionMedia
          text={q.text} image={q.image ?? null}
          onImage={(image) => setQ(cur, (x) => { x.image = image; })}
          onInsert={(tex) => {
            const el = document.getElementById(`q-${q.id}`) as HTMLTextAreaElement | null;
            const a = el?.selectionStart ?? q.text.length, b = el?.selectionEnd ?? a;
            setQ(cur, (x) => { x.text = x.text.slice(0, a) + tex + x.text.slice(b); });
            requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + tex.length, a + tex.length); });
          }}
        />
        <div>
          <p className="label">Answer options. Tick the correct one.</p>
          <div className="space-y-2">
            {q.options.map((o, j) => (
              <div key={o.id}>
                <div className="flex items-center gap-2">
                  <input type="radio" className="h-6 w-6 shrink-0 accent-[#12b886]" name={`correct-${q.id}`} checked={q.correctId === o.id} onChange={() => setQ(cur, (x) => { x.correctId = o.id; })} aria-label={`Option ${j + 1} is correct`} />
                  <input className="field" value={o.text} placeholder={`Option ${j + 1}`} aria-label={`Option ${j + 1} text`} maxLength={300} onChange={(e) => setQ(cur, (x) => { x.options[j]!.text = e.target.value; })} />
                  <button type="button" className="btn btn-secondary shrink-0 !px-3" disabled={q.options.length <= limits.minOptions} onClick={() => setQ(cur, (x) => { x.options.splice(j, 1); if (x.correctId === o.id) x.correctId = x.options[0]!.id; })} aria-label={`Remove option ${j + 1}`}>✕</button>
                </div>
                {hasMath(o.text) && <p className="hint ml-8 mt-1">Shows as: <span className="font-semibold text-ink"><Rich text={o.text} inline /></span></p>}
              </div>
            ))}
          </div>
          <button type="button" className="btn-quiet mt-2" disabled={q.options.length >= limits.maxOptions} onClick={() => setQ(cur, (x) => { x.options.push({ id: uid(), text: '' }); })}>+ Add option</button>
        </div>
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer font-bold">{exam ? 'Marks and explanation (optional)' : 'Marks, points and explanation (optional)'}</summary>
          <div className="mt-3 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Marks (academic)" htmlFor={`m-${q.id}`} hint="Counts towards the grade and pass mark."><input id={`m-${q.id}`} type="number" min={0.5} step={0.5} className="field" value={q.marks} onChange={(e) => setQ(cur, (x) => { x.marks = Number(e.target.value); })} /></Field>
              {!exam && <Field label="Points (game reward)" htmlFor={`p-${q.id}`} hint="Used by the Points style. Wrong or unanswered earns 0."><input id={`p-${q.id}`} type="number" min={0} step={10} className="field" value={q.points} onChange={(e) => setQ(cur, (x) => { x.points = Number(e.target.value); })} /></Field>}
            </div>
            <Field label="Explanation (optional)" htmlFor={`e-${q.id}`} hint={exam ? 'Shown with the correct answer when you release results, if you choose to show answers.' : 'Shown with the answer after the question is judged.'}><input id={`e-${q.id}`} className="field" value={q.explanation} onChange={(e) => setQ(cur, (x) => { x.explanation = e.target.value; })} maxLength={1000} /></Field>
          </div>
        </details>
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer font-bold">Move, copy or delete this question</summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" disabled={cur === 0} onClick={() => { onEdit((qs) => { const [m] = qs.splice(cur, 1); qs.splice(cur - 1, 0, m!); }); setQi(cur - 1); }}>Move earlier</button>
            <button type="button" className="btn btn-secondary" disabled={cur === questions.length - 1} onClick={() => { onEdit((qs) => { const [m] = qs.splice(cur, 1); qs.splice(cur + 1, 0, m!); }); setQi(cur + 1); }}>Move later</button>
            <button type="button" className="btn btn-secondary" onClick={() => { onEdit((qs) => { qs.splice(cur + 1, 0, { ...structuredClone(q), id: uid(), options: q.options.map((o) => ({ ...o, id: o.id + 'c' })), correctId: q.correctId + 'c' }); }); setQi(cur + 1); }}>Duplicate</button>
            <button type="button" className="btn btn-secondary text-danger" disabled={questions.length <= 1} onClick={() => { onEdit((qs) => { qs.splice(cur, 1); }); setQi(Math.max(0, cur - 1)); }}>Delete question</button>
          </div>
        </details>
      </fieldset>

      <div className="flex justify-between gap-2">
        <button type="button" className="btn btn-secondary" disabled={cur === 0} onClick={() => setQi(cur - 1)}>← Previous question</button>
        {cur < questions.length - 1
          ? <button type="button" className="btn btn-secondary" onClick={() => setQi(cur + 1)}>Next question →</button>
          : <button type="button" className="btn btn-secondary" disabled={questions.length >= limits.maxQuestions} onClick={addQuestion}>Add another question</button>}
      </div>
    </section>
  );
}
