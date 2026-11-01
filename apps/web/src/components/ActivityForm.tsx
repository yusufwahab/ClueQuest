import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { Field, Notice } from './ui';

type Mode = 'solo' | 'live' | 'cbt';
const MODE_TEXT: Record<Mode, { name: string; desc: string }> = {
  solo: { name: 'Solo practice', desc: 'A public link. Anyone with it can play on their own. Good for practice and revision.' },
  live: { name: 'Live game', desc: 'You host a room with a code. Everyone answers the same question together.' },
  cbt: { name: 'CBT exam', desc: 'Individual exam with a window, timer, attempt limit and results released by you. Candidates use personal invitation links.' },
};

const toIso = (v: string) => (v ? new Date(v).toISOString() : null);

/** One form for every way to use a published quest. Participation (mode) and scoring (style) are independent choices. */
export default function ActivityForm({ quizId, fixedMode, submitLabel = 'Create', onCreated }: { quizId: string; fixedMode?: Mode; submitLabel?: string; onCreated: (activity: any) => void }) {
  const [mode, setMode] = useState<Mode>(fixedMode ?? 'solo');
  const [style, setStyle] = useState<'points' | 'steps'>('points');
  const [wrong, setWrong] = useState<'stay' | 'down'>('stay');
  const [pass, setPass] = useState(''); const [instant, setInstant] = useState(false); const [secs, setSecs] = useState(30);
  const [opens, setOpens] = useState(''); const [closes, setCloses] = useState(''); const [duration, setDuration] = useState(30);
  const [attempts, setAttempts] = useState(1); const [release, setRelease] = useState<'immediate' | 'after_close' | 'manual'>('immediate'); const [showAnswers, setShowAnswers] = useState(true);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const body: any = { quizId, mode, style, steps: { wrong }, passMarkPercent: pass === '' ? null : Number(pass), showAnswers };
      if (mode === 'solo') body.instantFeedback = instant;
      if (mode === 'live') body.secondsPerQuestion = secs;
      if (mode === 'cbt') Object.assign(body, { opensAt: toIso(opens), closesAt: toIso(closes), durationMinutes: duration, attemptLimit: attempts, release });
      onCreated(await api('POST', '/activities', { body }));
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not create'); } finally { setBusy(false); }
  };

  return (
    <form className="space-y-5" onSubmit={submit}>
      {error && <Notice kind="bad">{error}</Notice>}
      {!fixedMode && (
        <fieldset>
          <legend className="label">How will people take it?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(MODE_TEXT) as Mode[]).map((m) => (
              <label key={m} className={`block cursor-pointer rounded-md border-2 p-3 ${mode === m ? 'border-primary bg-primary-soft' : 'border-line bg-surface'}`}>
                <input type="radio" className="mr-2 accent-[#1f4fd8]" name="mode" checked={mode === m} onChange={() => setMode(m)} />
                <span className="font-semibold">{MODE_TEXT[m].name}</span>
                <span className="hint mt-1 block">{MODE_TEXT[m].desc}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="label">Scoring style</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={`block cursor-pointer rounded-md border-2 p-3 ${style === 'points' ? 'border-primary bg-primary-soft' : 'border-line bg-surface'}`}>
            <input type="radio" className="mr-2 accent-[#1f4fd8]" name="style" checked={style === 'points'} onChange={() => setStyle('points')} />
            <span className="font-semibold">Points</span><span className="hint mt-1 block">Each correct answer earns the points you set on that question. Wrong or unanswered earns zero.</span>
          </label>
          <label className={`block cursor-pointer rounded-md border-2 p-3 ${style === 'steps' ? 'border-primary bg-primary-soft' : 'border-line bg-surface'}`}>
            <input type="radio" className="mr-2 accent-[#1f4fd8]" name="style" checked={style === 'steps'} onChange={() => setStyle('steps')} />
            <span className="font-semibold">Steps</span><span className="hint mt-1 block">Start at step 0. A correct answer moves up one step.</span>
          </label>
        </div>
        <p className="hint mt-2">Marks for the grade and pass mark are always tracked separately from Points and Steps.</p>
      </fieldset>
      {style === 'steps' && (
        <Field label="When an answer is wrong or missing" htmlFor="wrong" hint="A player never goes below step 0.">
          <select id="wrong" className="field" value={wrong} onChange={(e) => setWrong(e.target.value as 'stay' | 'down')}>
            <option value="stay">Stay on the same step</option><option value="down">Move down one step</option>
          </select>
        </Field>
      )}
      <Field label="Pass mark (% of marks, optional)" htmlFor="pass" hint="Passing depends on marks only, never on points or steps.">
        <input id="pass" type="number" min={0} max={100} className="field" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="e.g. 50" />
      </Field>
      {mode === 'solo' && (
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 accent-[#1f4fd8]" checked={instant} onChange={(e) => setInstant(e.target.checked)} />
          <span><span className="font-semibold">Instant feedback</span><span className="hint block">Each answer is judged and locked as soon as it is chosen. Without it, learners can change answers until they submit.</span></span></label>
      )}
      {mode === 'live' && <Field label="Seconds per question" htmlFor="secs"><input id="secs" type="number" min={5} max={300} className="field" value={secs} onChange={(e) => setSecs(Number(e.target.value))} /></Field>}
      {mode === 'cbt' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Opens (optional)" htmlFor="opens"><input id="opens" type="datetime-local" className="field" value={opens} onChange={(e) => setOpens(e.target.value)} /></Field>
          <Field label="Closes (optional)" htmlFor="closes"><input id="closes" type="datetime-local" className="field" value={closes} onChange={(e) => setCloses(e.target.value)} /></Field>
          <Field label="Duration (minutes)" htmlFor="dur" hint="The server ends the attempt at this time, even if the page is closed."><input id="dur" type="number" min={1} max={600} className="field" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></Field>
          <Field label="Attempts allowed" htmlFor="att"><input id="att" type="number" min={1} max={20} className="field" value={attempts} onChange={(e) => setAttempts(Number(e.target.value))} /></Field>
          <Field label="Release results" htmlFor="rel">
            <select id="rel" className="field" value={release} onChange={(e) => setRelease(e.target.value as typeof release)}>
              <option value="immediate">Immediately after submission</option><option value="after_close">After the exam closes</option><option value="manual">When I release them</option>
            </select>
          </Field>
        </div>
      )}
      {mode !== 'live' && (
        <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 accent-[#1f4fd8]" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />
          <span><span className="font-semibold">Show correct answers in the released result</span></span></label>
      )}
      <button className="btn btn-primary" disabled={busy}>{submitLabel}</button>
    </form>
  );
}
