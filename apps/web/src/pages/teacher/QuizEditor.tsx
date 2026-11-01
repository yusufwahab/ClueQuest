import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { limits } from '@cluequest/config';
import { validatePublishable } from '@cluequest/contracts';
import { ApiError, api } from '../../lib/api';
import { Field, Loading, Notice } from '../../components/ui';
import AiAssistant, { type AiResult } from '../../components/AiAssistant';

interface Opt { id: string; text: string }
interface Q { id: string; text: string; options: Opt[]; correctId: string; marks: number; points: number; explanation: string }
interface Draft { title: string; subject: string; instructions: string; questions: Q[] }

const uid = () => Math.random().toString(36).slice(2, 10);
const newQuestion = (): Q => { const a = uid(), b = uid(); return { id: uid(), text: '', options: [{ id: a, text: '' }, { id: b, text: '' }], correctId: a, marks: 1, points: 100, explanation: '' }; };

export default function QuizEditor() {
  const { id } = useParams();
  const nav = useNavigate();
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
    }).catch((e) => setMsg({ kind: 'bad', text: e.message })).finally(() => setLoading(false));
  }, [id]);

  const edit = (fn: (d: Draft) => void) => { setDraft((d) => { const c = structuredClone(d); fn(c); return c; }); setDirty(true); };
  const setQ = (i: number, fn: (q: Q) => void) => edit((d) => fn(d.questions[i]!));

  const save = async (): Promise<string | null> => {
    setBusy(true); setMsg(null);
    try {
      const body = { ...draft, title: draft.title.trim() || 'Untitled quest' };
      const r = quizId.current ? await api('PUT', `/quizzes/${quizId.current}`, { body }) : await api('POST', '/quizzes', { body });
      quizId.current = r.id; setSavedId(r.id); setDirty(false); setMeta({ latestVersion: r.latestVersion, allowPartners: r.allowPartners });
      void qc.invalidateQueries({ queryKey: ['quizzes'] });
      if (!id) nav(`/quizzes/${r.id}`, { replace: true });
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
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{id ? 'Edit quest' : 'Create quest'}</h1>
        <p className="hint">{meta?.latestVersion ? `Published v${meta.latestVersion}${dirty ? ' · unpublished changes' : ''}` : 'Draft'}</p>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}{msg.list && <ul className="mt-2 list-disc pl-5">{msg.list.map((p) => <li key={p}>{p}</li>)}</ul>}</Notice>}

      <AiAssistant onResult={applyAi} />

      <section className="card space-y-4" aria-label="Quest details">
        <Field label="Title" htmlFor="title"><input id="title" className="field" value={draft.title} onChange={(e) => edit((d) => { d.title = e.target.value; })} maxLength={120} /></Field>
        <Field label="Subject (optional)" htmlFor="subject" hint="For example Mathematics, History, French, Technology."><input id="subject" className="field" value={draft.subject} onChange={(e) => edit((d) => { d.subject = e.target.value; })} maxLength={60} /></Field>
        <Field label="Instructions (optional)" htmlFor="instr" hint="Shown to learners before they start."><textarea id="instr" className="field min-h-24" value={draft.instructions} onChange={(e) => edit((d) => { d.instructions = e.target.value; })} maxLength={2000} /></Field>
      </section>

      <section className="space-y-4" aria-label="Questions">
        <div className="flex items-baseline justify-between"><h2>Questions ({draft.questions.length})</h2><p className="hint">Total marks: {total}</p></div>
        {draft.questions.map((q, i) => (
          <fieldset key={q.id} className="card space-y-4">
            <legend className="px-1 text-base font-semibold">Question {i + 1}</legend>
            <Field label="Question" htmlFor={`q-${q.id}`}><textarea id={`q-${q.id}`} className="field min-h-20" value={q.text} onChange={(e) => setQ(i, (x) => { x.text = e.target.value; })} maxLength={1000} /></Field>
            <div>
              <p className="label">Answer options — select the correct one</p>
              <div className="space-y-2">
                {q.options.map((o, j) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <input type="radio" className="h-6 w-6 shrink-0 accent-[#1f4fd8]" name={`correct-${q.id}`} checked={q.correctId === o.id} onChange={() => setQ(i, (x) => { x.correctId = o.id; })} aria-label={`Option ${j + 1} is correct`} />
                    <input className="field" value={o.text} placeholder={`Option ${j + 1}`} aria-label={`Option ${j + 1} text`} maxLength={300} onChange={(e) => setQ(i, (x) => { x.options[j]!.text = e.target.value; })} />
                    <button type="button" className="btn btn-secondary shrink-0" disabled={q.options.length <= limits.minOptions} onClick={() => setQ(i, (x) => { x.options.splice(j, 1); if (x.correctId === o.id) x.correctId = x.options[0]!.id; })} aria-label={`Remove option ${j + 1}`}>Remove</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-quiet mt-2" disabled={q.options.length >= limits.maxOptions} onClick={() => setQ(i, (x) => { x.options.push({ id: uid(), text: '' }); })}>Add option</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Marks (academic)" htmlFor={`m-${q.id}`} hint="Counts towards the grade and pass mark."><input id={`m-${q.id}`} type="number" min={0.5} step={0.5} className="field" value={q.marks} onChange={(e) => setQ(i, (x) => { x.marks = Number(e.target.value); })} /></Field>
              <Field label="Points (game reward)" htmlFor={`p-${q.id}`} hint="Used by the Points style. Wrong or unanswered earns 0."><input id={`p-${q.id}`} type="number" min={0} step={10} className="field" value={q.points} onChange={(e) => setQ(i, (x) => { x.points = Number(e.target.value); })} /></Field>
            </div>
            <Field label="Explanation (optional)" htmlFor={`e-${q.id}`} hint="Shown with the answer after the question is judged."><input id={`e-${q.id}`} className="field" value={q.explanation} onChange={(e) => setQ(i, (x) => { x.explanation = e.target.value; })} maxLength={1000} /></Field>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary" disabled={i === 0} onClick={() => edit((d) => { const [m] = d.questions.splice(i, 1); d.questions.splice(i - 1, 0, m!); })}>Move up</button>
              <button type="button" className="btn btn-secondary" disabled={i === draft.questions.length - 1} onClick={() => edit((d) => { const [m] = d.questions.splice(i, 1); d.questions.splice(i + 1, 0, m!); })}>Move down</button>
              <button type="button" className="btn btn-secondary" onClick={() => edit((d) => { d.questions.splice(i + 1, 0, { ...structuredClone(q), id: uid(), options: q.options.map((o) => ({ ...o, id: o.id + 'c' })), correctId: q.correctId + 'c' }); })}>Duplicate</button>
              <button type="button" className="btn btn-secondary" disabled={draft.questions.length <= 1} onClick={() => edit((d) => { d.questions.splice(i, 1); })}>Delete question</button>
            </div>
          </fieldset>
        ))}
        <button type="button" className="btn btn-secondary" disabled={draft.questions.length >= limits.maxQuestions} onClick={() => edit((d) => { d.questions.push(newQuestion()); })}>Add question</button>
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-paper px-4 py-3 safe-bottom md:-mx-8 md:px-8">
        <button className="btn btn-secondary" onClick={save} disabled={busy}>Save draft</button>
        {savedId && <Link className="btn btn-secondary" to={`/quizzes/${savedId}/preview`} onClick={(e) => { if (dirty) { e.preventDefault(); void save().then((ok) => { if (ok) nav(`/quizzes/${ok}/preview`); }); } }}>Preview as player</Link>}
        <button className="btn btn-primary" onClick={publish} disabled={busy}>Publish</button>
        {meta?.latestVersion ? <Link className="btn btn-secondary" to={`/quizzes/${savedId}/use`}>Use this quest</Link> : null}
        {dirty && <span className="hint">Unsaved changes</span>}
      </div>
    </div>
  );
}
