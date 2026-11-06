import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { limits } from '@cluequest/config';
import { validatePublishable } from '@cluequest/contracts';
import { ApiError, api } from '../../lib/api';
import { Field, Loading, Notice, PageHead, Stepper } from '../../components/ui';
import AiAssistant, { type AiResult } from '../../components/AiAssistant';
import QuestionsEditor, { newQuestion, type Q } from '../../components/QuestionsEditor';
import { RulesStep, ScheduleStep, defaultExamSettings, examBody, fromActivity, scheduleProblem, type ExamSettings } from '../../components/ExamSettings';

interface Draft { title: string; subject: string; instructions: string; questions: Q[] }
const STEPS = ['Details', 'Questions', 'Schedule', 'Rules'];

/**
 * Create or edit an exam. An exam has its own questions, written here with the same editor as quests, and is not made from a quest.
 *  /exams/new              a new exam
 *  /exams/draft/:quizId    carry on with an exam that was started but not created yet
 *  /exams/:activityId/edit change a created exam (until the first candidate starts)
 */
export default function ExamEditor() {
  const { quizId: draftId, activityId } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const carried = (useLocation().state ?? {}) as { step?: number; qi?: number };
  const [step, setStep] = useState(carried.step ?? (draftId || activityId ? 1 : 0));
  const [qi, setQi] = useState(carried.qi ?? 0);
  const [draft, setDraft] = useState<Draft>({ title: '', subject: '', instructions: '', questions: [newQuestion()] });
  const [settings, setSettings] = useState<ExamSettings>(defaultExamSettings);
  const [loading, setLoading] = useState(!!(draftId || activityId));
  const [locked, setLocked] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'bad' | 'warn'; text: string; list?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const quizId = useRef<string | undefined>(draftId);

  useEffect(() => {
    if (!draftId && !activityId) return;
    (async () => {
      try {
        let qid = draftId;
        if (activityId) {
          const a = await api('GET', `/activities/${activityId}`);
          qid = a.quizId; quizId.current = qid;
          setSettings(fromActivity(a.settings));
          if (a.attempts.length > 0) setLocked(true);
        }
        const r = await api('GET', `/quizzes/${qid}`);
        setDraft({ title: r.title, subject: r.subject, instructions: r.instructions, questions: r.questions.length ? r.questions : [newQuestion()] });
      } catch (e) { setMsg({ kind: 'bad', text: (e as Error).message }); } finally { setLoading(false); }
    })();
  }, [draftId, activityId]);

  const edit = (fn: (d: Draft) => void) => { setDraft((d) => { const c = structuredClone(d); fn(c); return c; }); setDirty(true); };
  const change = (p: Partial<ExamSettings>) => { setSettings((s) => ({ ...s, ...p })); setDirty(true); };

  /** Saves the questions as a draft. Rules are not saved until the exam is created. */
  const saveDraft = async (): Promise<string | null> => {
    setBusy(true); setMsg(null);
    try {
      const body = { ...draft, title: draft.title.trim() || 'Untitled CBT' };
      const r = quizId.current ? await api('PUT', `/quizzes/${quizId.current}`, { body }) : await api('POST', '/quizzes?kind=exam', { body });
      quizId.current = r.id; setDirty(false);
      void qc.invalidateQueries({ queryKey: ['exam-drafts'] });
      if (!draftId && !activityId) nav(`/exams/draft/${r.id}`, { replace: true, state: { step, qi } });
      setMsg({ kind: 'ok', text: 'Draft saved.' });
      return r.id as string;
    } catch (e) { setMsg({ kind: 'bad', text: e instanceof ApiError ? e.message : 'Could not save' }); return null; } finally { setBusy(false); }
  };

  const problems = validatePublishable(draft);
  const timing = scheduleProblem(settings, !!activityId);

  const finish = async () => {
    if (problems.length) return setMsg({ kind: 'warn', text: 'Fix these before creating the CBT:', list: problems });
    if (timing) return setMsg({ kind: 'warn', text: timing });
    const qid = await saveDraft(); if (!qid) return;
    setBusy(true);
    try {
      const a = activityId ? await api('PUT', `/exams/${activityId}`, { body: examBody(settings) }) : await api('POST', '/exams', { body: { quizId: qid, ...examBody(settings) } });
      void qc.invalidateQueries({ queryKey: ['activities'] }); void qc.invalidateQueries({ queryKey: ['exam-drafts'] });
      nav(`/activities/${a.id}`);
    } catch (e) { setMsg({ kind: 'bad', text: e instanceof ApiError ? e.message : 'Could not create the CBT', list: (e as ApiError).details?.problems }); } finally { setBusy(false); }
  };

  /** Merge an AI draft into the editor, as in quests. */
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
    setMsg({ kind: 'ok', text: `Added ${n} question${n === 1 ? '' : 's'} from the AI assistant. AI can make mistakes: check every question and answer before you create the CBT.` });
  };

  if (loading) return <Loading />;
  const go = (n: number) => { setStep(n); window.scrollTo({ top: 0 }); };
  const total = draft.questions.reduce((n, q) => n + (Number(q.marks) || 0), 0);

  if (locked) {
    return (
      <div className="space-y-6">
        <PageHead back={{ to: `/activities/${activityId}`, label: 'Back to the CBT' }} title="This CBT is locked" />
        <Notice kind="warn">Candidates have already started this CBT, so its questions and rules can no longer be changed. This protects everyone who has sat it. You can still invite more candidates, close the CBT and release results.</Notice>
        <Link className="btn btn-primary" to={`/activities/${activityId}`}>Back to the CBT</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <PageHead back={{ to: activityId ? `/activities/${activityId}` : '/exams', label: activityId ? 'Back to the CBT' : 'Exams' }} title={activityId ? 'Edit CBT' : 'Create CBT'}
        sub={activityId ? 'You can change anything until the first candidate starts.' : 'Write the questions, set the schedule and rules, then invite candidates. Nothing is visible to candidates until you invite them.'} />
      <Stepper steps={STEPS} current={step} onGo={go} />
      {msg && <Notice kind={msg.kind}>{msg.text}{msg.list && <ul className="mt-2 list-disc pl-5">{msg.list.map((p) => <li key={p}>{p}</li>)}</ul>}</Notice>}

      {step === 0 && (
        <>
          <AiAssistant onResult={applyAi} />
          <section className="card space-y-4" aria-label="CBT details">
            <Field label="CBT title" htmlFor="title"><input id="title" className="field" value={draft.title} onChange={(e) => edit((d) => { d.title = e.target.value; })} maxLength={120} placeholder="e.g. Mathematics mid-term" /></Field>
            <Field label="Subject (optional)" htmlFor="subject"><input id="subject" className="field" value={draft.subject} onChange={(e) => edit((d) => { d.subject = e.target.value; })} maxLength={60} /></Field>
            <Field label="Instructions for candidates (optional)" htmlFor="instr" hint="Shown on the page candidates see before they start."><textarea id="instr" className="field min-h-28" value={draft.instructions} onChange={(e) => edit((d) => { d.instructions = e.target.value; })} maxLength={2000} placeholder={'Answer all questions.\nNo calculators.'} /></Field>
          </section>
        </>
      )}
      {step === 1 && <QuestionsEditor mode="exam" questions={draft.questions} qi={qi} setQi={setQi} onEdit={(fn) => edit((d) => fn(d.questions))} />}
      {step === 2 && <ScheduleStep value={settings} onChange={change} />}
      {step === 3 && (
        <>
          <RulesStep value={settings} onChange={change} />
          <section className="card space-y-3" aria-label="Check before you create">
            <h2>Check before you {activityId ? 'save' : 'create'}</h2>
            <ul className="space-y-1">
              <li><strong>{draft.title.trim() || 'Untitled CBT'}</strong>{draft.subject && <span className="hint"> · {draft.subject}</span>}</li>
              <li>{draft.questions.length} question{draft.questions.length === 1 ? '' : 's'} · {total} marks in total · {settings.duration} minutes · {settings.attempts} attempt{settings.attempts === 1 ? '' : 's'}</li>
            </ul>
            {problems.length || timing
              ? <Notice kind="warn">A few things to fix first:<ul className="mt-2 list-disc pl-5">{[...problems, timing].filter(Boolean).map((p) => <li key={p}>{p}</li>)}</ul><button type="button" className="btn-quiet mt-1" onClick={() => go(problems.length ? 1 : 2)}>{problems.length ? 'Go back to the questions' : 'Go back to the schedule'}</button></Notice>
              : <Notice kind="ok">Everything looks ready.</Notice>}
          </section>
        </>
      )}

      <div className="sticky bottom-16 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t border-line bg-paper px-4 py-3 md:bottom-0 md:-mx-8 md:px-8">
        {step > 0 && <button className="btn btn-secondary" onClick={() => go(step - 1)}>Back</button>}
        <button className="btn btn-secondary" onClick={saveDraft} disabled={busy}>Save draft</button>
        <span className="flex-1" />
        {dirty && <span className="hint hidden sm:inline">Unsaved changes</span>}
        {step < 3 && <button className="btn btn-primary" onClick={() => go(step + 1)}>{['Next: questions', 'Next: schedule', 'Next: rules'][step]}</button>}
        {step === 3 && <button className="btn btn-primary" onClick={finish} disabled={busy}>{activityId ? 'Save changes' : 'Create CBT'}</button>}
      </div>
    </div>
  );
}
