import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { limits } from '@cluequest/config';
import { validatePublishable } from '@cluequest/contracts';
import { ApiError, api } from '../../lib/api';
import { Field, Loading, Notice, PageHead, Stepper } from '../../components/ui';
import AiAssistant, { type AiResult } from '../../components/AiAssistant';
import QuestionsEditor, { newQuestion, type Q } from '../../components/QuestionsEditor';
import ScoringChoice, { type Style, type Wrong } from '../../components/ScoringChoice';

interface Draft { title: string; subject: string; instructions: string; questions: Q[] }

export default function QuizEditor() {
  const { id } = useParams();
  const nav = useNavigate();
  const carried = (useLocation().state ?? {}) as { step?: number; qi?: number };
  const wantsAi = useSearchParams()[0].get('ai') === '1' && !id; // arrived from "Draft with AI"
  const [step, setStep] = useState(carried.step ?? (id ? 2 : wantsAi ? 1 : 0));
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
  const problems = validatePublishable(draft);
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
          <AiAssistant onResult={applyAi} autoOpen={wantsAi && !dirty && !draft.title} />
          <section className="card space-y-4" aria-label="Quest details">
            <Field label="Title" htmlFor="title"><input id="title" className="field" value={draft.title} onChange={(e) => edit((d) => { d.title = e.target.value; })} maxLength={120} /></Field>
            <Field label="Subject (optional)" htmlFor="subject" hint="For example Mathematics, History, French, Technology."><input id="subject" className="field" value={draft.subject} onChange={(e) => edit((d) => { d.subject = e.target.value; })} maxLength={60} /></Field>
            <Field label="Instructions (optional)" htmlFor="instr" hint="Shown to learners before they start."><textarea id="instr" className="field min-h-24" value={draft.instructions} onChange={(e) => edit((d) => { d.instructions = e.target.value; })} maxLength={2000} /></Field>
          </section>
        </>
      )}

      {step === 2 && <QuestionsEditor questions={draft.questions} qi={qi} setQi={setQi} onEdit={(fn) => edit((d) => fn(d.questions))} />}

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
