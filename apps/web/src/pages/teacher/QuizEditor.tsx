import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { limits } from '@cluequest/config';
import { validatePublishable } from '@cluequest/contracts';
import { ApiError, api } from '../../lib/api';
import { Field, Loading, Notice, PageHead, Stepper } from '../../components/ui';
import AiAssistant, { type AiResult } from '../../components/AiAssistant';
import QuestionMedia from '../../components/QuestionMedia';
import { Rich, hasMath } from '../../components/Rich';
import ScoringChoice, { type Style, type Wrong } from '../../components/ScoringChoice';

interface Opt { id: string; text: string }
interface Q { id: string; text: string; options: Opt[]; correctId: string; marks: number; points: number; explanation: string; image?: { id: string; alt: string; url?: string | null } | null }
interface Draft { title: string; subject: string; instructions: string; questions: Q[] }

const uid = () => Math.random().toString(36).slice(2, 10);
const newQuestion = (): Q => { const a = uid(), b = uid(); return { id: uid(), text: '', options: [{ id: a, text: '' }, { id: b, text: '' }], correctId: a, marks: 1, points: 100, explanation: '', image: null }; };

export default function QuizEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const carried = (useLocation().state ?? {}) as { step?: number; qi?: number };
  const [step, setStep] = useState(carried.step ?? (id ? 2 : 0));
  const [play, setPlayState] = useState<{ style: Style; wrong: Wrong; pass: string }>({ style: 'points', wrong: 'stay', pass: '' });
  const setPlay = (p: Partial<typeof play>) => { setPlayState((x) => ({ ...x, ...p })); setDirty(true); };
  const [qi, setQi] = useState(carried.qi ?? 0);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>({ title: '', subject: '', instructions: '', questions: [newQuestion()] });
  const [meta, setMeta] = useState<{ latestVersion: number; allowPartners: boolean } | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad' | 'warn'; text: string; list?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const quizId = useRef(id);
  const [savedId, setSavedId] = useState(id);

  useEffect(() => {
    if (!id) return;
    api('GET', `/quizzes/${id}`).then((r) => {
      setDraft({ title: r.title, subject: r.subject, instructions: r.instructions, questions: r.questions.length ? r.questions : [newQuestion()] });
      setMeta({ latestVersion: r.latestVersion, allowPartners: r.allowPartners });
      if (r.play) setPlayState({ style: r.play.style, wrong: r.play.wrong, pass: r.play.passMarkPercent == null ? '' : String(r.play.passMarkPercent) });
    }).catch((e) => setMsg({ kind: 'bad', text: e.message })).finally(() => setLoading(false));
  }, [id]);

  const edit = (fn: (d: Draft) => void) => { setDraft((d) => { const c = structuredClone(d); fn(c); return c; }); setDirty(true); };
  const setQ = (i: number, fn: (q: Q) => void) => edit((d) => fn(d.questions[i]!));

  const save = async (): Promise<string | null> => {
    setBusy(true); setMsg(null);
    try {
      const body = { ...draft, title: draft.title.trim() || 'Untitled quest', play: { style: play.style, wrong: play.wrong, passMarkPercent: play.pass === '' ? null : Number(play.pass) } };
      const r = quizId.current ? await api('PUT', `/quizzes/${quizId.current}`, { body }) : await api('POST', '/quizzes', { body });
      quizId.current = r.id; setSavedId(r.id); setDirty(false); setMeta({ latestVersion: r.latestVersion, allowPartners: r.allowPartners });
      void qc.invalidateQueries({ queryKey: ['quizzes'] });
      if (!id) nav(`/quizzes/${r.id}`, { replace: true, state: { step, qi } });
      setMsg({ kind: 'ok', text: 'Draft saved.' });
      return r.id as string;
    } catch (e) { setMsg({ kind: 'bad', text: e instanceof ApiError ? e.message : 'Could not save' }); return null; } finally { setBusy(false); }
  };

  const publish = async () => {
    const problems = validatePublishable(draft);
    if (problems.length) return setMsg({ kind: 'warn', text: 'Fix these before publishing:', list: problems });
    const qid = await save(); if (!qid) return;
    setBusy(true);
    try {
      const r = await api('POST', `/quizzes/${qid}/publish`);
      setMeta((m) => ({ allowPartners: m?.allowPartners ?? false, latestVersion: r.version }));
      setMsg({ kind: 'ok', text: `Published as version ${r.version}. Existing activities keep using the version they started with.` });
    } catch (e) { setMsg({ kind: 'bad', text: (e as Error).message, list: (e as ApiError).details?.problems }); } finally { setBusy(false); }
  };

  /** Merge an AI draft into the editor: fill empty top fields, drop the untouched blank question, append the new ones. */
  const applyAi = (r: AiResult) => {
    edit((d) => {
      if (!d.title.trim()) d.title = r.title;
      if (!d.subject.trim()) d.subject = r.subject;
      if (!d.instructions.trim()) d.instructions = r.instructions;
      d.questions = d.questions.filter((q) => q.text.trim() || q.options.some((o) => o.text.trim()));
      d.questions.push(...r.questions.slice(0, Math.max(0, limits.maxQuestions - d.questions.length)));
      if (!d.questions.length) d.questions.push(newQuestion());
    });
    const n = r.questions.length;
    const left = r.skipped ? ` (${r.skipped} unusable ${r.skipped === 1 ? 'one was' : 'ones were'} left out)` : '';
    setMsg({ kind: 'ok', text: `Added ${n} question${n === 1 ? '' : 's'} from the AI assistant${left}. AI can make mistakes: check every question and answer before you publish.` });
  };

  if (loading) return <Loading />;
  const total = draft.questions.reduce((n, q) => n + (Number(q.marks) || 0), 0);
  const cur = Math.min(qi, draft.questions.length - 1);
  const q = draft.questions[cur]!;
  const problems = validatePublishable(draft);
  const blank = (x: Q) => !x.text.trim() || x.options.some((o) => !o.text.trim());
  const addQuestion = () => { edit((d) => { d.questions.push(newQuestion()); }); setQi(draft.questions.length); };
  const go = (n: number) => { setStep(n); window.scrollTo({ top: 0 }); };
  const published = !!meta?.latestVersion && !dirty;

  return (
    <div className="space-y-6 pb-4">
      <PageHead
        back={{ to: '/quizzes', label: 'My quests' }}
        title={id ? 'Edit quest' : 'Create quest'}
        sub={meta?.latestVersion ? `Published v${meta.latestVersion}${dirty ? ' · you have unpublished changes' : ''}` : 'Draft: nobody can see it until you publish.'}
      />
      <Stepper steps={['Scoring', 'Details', 'Questions', 'Review and publish']} current={step} onGo={go} />
      {msg && <Notice kind={msg.kind}>{msg.text}{msg.list && <ul className="mt-2 list-disc pl-5">{msg.list.map((p) => <li key={p}>{p}</li>)}</ul>}</Notice>}

      {step === 0 && (
        <section className="card space-y-5" aria-label="Scoring">
          <div>
            <h2>First, choose how this quest is played</h2>
            <p className="hint mt-1">This sets the style players will see. You can change it later, even when you share the quest.</p>
          </div>
          <ScoringChoice style={play.style} wrong={play.wrong} onStyle={(style) => setPlay({ style })} onWrong={(wrong) => setPlay({ wrong })} />
          <Field label="Pass mark (% of marks, optional)" htmlFor="pass" hint="Leave empty for no pass or fail. It is based on marks only, never on points or steps.">
            <input id="pass" type="number" min={0} max={100} className="field sm:max-w-48" value={play.pass} onChange={(e) => setPlay({ pass: e.target.value })} placeholder="e.g. 50" />
          </Field>
        </section>
      )}

      {step === 1 && (
        <>
          <AiAssistant onResult={applyAi} />
          <section className="card space-y-4" aria-label="Quest details">
            <Field label="Title" htmlFor="title"><input id="title" className="field" value={draft.title} onChange={(e) => edit((d) => { d.title = e.target.value; })} maxLength={120} /></Field>
            <Field label="Subject (optional)" htmlFor="subject" hint="For example Mathematics, History, French, Technology."><input id="subject" className="field" value={draft.subject} onChange={(e) => edit((d) => { d.subject = e.target.value; })} maxLength={60} /></Field>
            <Field label="Instructions (optional)" htmlFor="instr" hint="Shown to learners before they start."><textarea id="instr" className="field min-h-24" value={draft.instructions} onChange={(e) => edit((d) => { d.instructions = e.target.value; })} maxLength={2000} /></Field>
          </section>
        </>
      )}

      {step === 2 && (
        <section className="space-y-4" aria-label="Questions">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2>Questions ({draft.questions.length})</h2><p className="hint">Total marks: {total}</p></div>
          <nav aria-label="Jump to a question" className="flex flex-wrap gap-2">
            {draft.questions.map((x, i) => (
              <button key={x.id} type="button" onClick={() => setQi(i)} aria-label={`Go to question ${i + 1}${blank(x) ? ' (unfinished)' : ''}`} aria-current={i === cur ? 'true' : undefined}
                className={`grid h-11 w-11 place-items-center rounded-xl border-2 font-extrabold ${i === cur ? 'border-primary bg-primary text-white' : blank(x) ? 'border-sun bg-warn-soft' : 'border-accent bg-accent-soft'}`}>{i + 1}</button>
            ))}
            <button type="button" className="h-11 rounded-xl border-2 border-dashed border-primary px-3 font-bold text-primary disabled:opacity-40" disabled={draft.questions.length >= limits.maxQuestions} onClick={addQuestion}>+ Add question</button>
          </nav>

          <fieldset key={q.id} className="card space-y-4">
            <legend className="sr-only">Question {cur + 1} of {draft.questions.length}</legend>
            <p aria-hidden className="chip">Question {cur + 1} of {draft.questions.length}</p>
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
              <summary className="cursor-pointer font-bold">Marks, points and explanation (optional)</summary>
              <div className="mt-3 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Marks (academic)" htmlFor={`m-${q.id}`} hint="Counts towards the grade and pass mark."><input id={`m-${q.id}`} type="number" min={0.5} step={0.5} className="field" value={q.marks} onChange={(e) => setQ(cur, (x) => { x.marks = Number(e.target.value); })} /></Field>
                  <Field label="Points (game reward)" htmlFor={`p-${q.id}`} hint="Used by the Points style. Wrong or unanswered earns 0."><input id={`p-${q.id}`} type="number" min={0} step={10} className="field" value={q.points} onChange={(e) => setQ(cur, (x) => { x.points = Number(e.target.value); })} /></Field>
                </div>
                <Field label="Explanation (optional)" htmlFor={`e-${q.id}`} hint="Shown with the answer after the question is judged."><input id={`e-${q.id}`} className="field" value={q.explanation} onChange={(e) => setQ(cur, (x) => { x.explanation = e.target.value; })} maxLength={1000} /></Field>
              </div>
            </details>
            <details className="rounded-xl border border-line p-3">
              <summary className="cursor-pointer font-bold">Move, copy or delete this question</summary>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary" disabled={cur === 0} onClick={() => { edit((d) => { const [m] = d.questions.splice(cur, 1); d.questions.splice(cur - 1, 0, m!); }); setQi(cur - 1); }}>Move earlier</button>
                <button type="button" className="btn btn-secondary" disabled={cur === draft.questions.length - 1} onClick={() => { edit((d) => { const [m] = d.questions.splice(cur, 1); d.questions.splice(cur + 1, 0, m!); }); setQi(cur + 1); }}>Move later</button>
                <button type="button" className="btn btn-secondary" onClick={() => { edit((d) => { d.questions.splice(cur + 1, 0, { ...structuredClone(q), id: uid(), options: q.options.map((o) => ({ ...o, id: o.id + 'c' })), correctId: q.correctId + 'c' }); }); setQi(cur + 1); }}>Duplicate</button>
                <button type="button" className="btn btn-secondary text-danger" disabled={draft.questions.length <= 1} onClick={() => { edit((d) => { d.questions.splice(cur, 1); }); setQi(Math.max(0, cur - 1)); }}>Delete question</button>
              </div>
            </details>
          </fieldset>

          <div className="flex justify-between gap-2">
            <button type="button" className="btn btn-secondary" disabled={cur === 0} onClick={() => setQi(cur - 1)}>← Previous question</button>
            {cur < draft.questions.length - 1
              ? <button type="button" className="btn btn-secondary" onClick={() => setQi(cur + 1)}>Next question →</button>
              : <button type="button" className="btn btn-secondary" disabled={draft.questions.length >= limits.maxQuestions} onClick={addQuestion}>Add another question</button>}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4" aria-label="Review and publish">
          <div className="card space-y-3">
            <h2>Check before you publish</h2>
            <ul className="space-y-1">
              <li><strong>{draft.title.trim() || 'Untitled quest'}</strong>{draft.subject && <span className="hint"> · {draft.subject}</span>}</li>
              <li>{draft.questions.length} question{draft.questions.length === 1 ? '' : 's'} · {total} marks in total</li>
              <li>Scored by <strong>{play.style === 'points' ? 'Points' : `Steps (wrong answer: ${play.wrong === 'down' ? 'move down' : 'stay'})`}</strong>{play.pass !== '' && ` · pass mark ${play.pass}%`} <button type="button" className="btn-quiet min-h-0! text-sm" onClick={() => go(0)}>Change</button></li>
            </ul>
            {problems.length === 0
              ? <Notice kind="ok">Everything looks ready.</Notice>
              : <Notice kind="warn">A few things to fix first:<ul className="mt-2 list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul><button type="button" className="btn-quiet mt-1" onClick={() => go(2)}>Go back to the questions</button></Notice>}
            <p className="hint">Publishing locks in this version so learners never see half-finished edits. You can edit and publish again later.</p>
          </div>
          {published && (
            <div className="card space-y-3 border-2 border-accent/50 bg-accent-soft/50">
              <h2>Your quest is live. What next?</h2>
              <p className="hint">Choose how people will take it. You will get a link or a code to copy.</p>
              <Link className="btn btn-primary w-full sm:w-auto" to={`/quizzes/${savedId}/use`}>Share or play this quest</Link>
            </div>
          )}
        </section>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-paper px-4 py-3 safe-bottom md:-mx-8 md:px-8">
        {step > 0 && <button className="btn btn-secondary" onClick={() => go(step - 1)}>Back</button>}
        <button className="btn btn-secondary" onClick={save} disabled={busy}>Save draft</button>
        {step === 3 && savedId && <Link className="btn btn-secondary" to={`/quizzes/${savedId}/preview`} onClick={(e) => { if (dirty) { e.preventDefault(); void save().then((ok) => { if (ok) nav(`/quizzes/${ok}/preview`); }); } }}>Preview as player</Link>}
        <span className="flex-1" />
        {dirty && <span className="hint">Unsaved changes</span>}
        {step < 3 && <button className="btn btn-primary" onClick={() => go(step + 1)}>{['Next: details', 'Next: questions', 'Next: review'][step]}</button>}
        {step === 3 && <button className="btn btn-primary" onClick={publish} disabled={busy}>Publish</button>}
      </div>
    </div>
  );
}
