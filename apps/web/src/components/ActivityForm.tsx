import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { Field, Icon, Notice, Stepper } from './ui';
import ScoringChoice from './ScoringChoice';

type Mode = 'solo' | 'live' | 'cbt';
const MODE_TEXT: Record<Mode, { name: string; icon: 'solo' | 'live' | 'exam'; desc: string }> = {
  solo: { name: 'Solo practice', icon: 'solo', desc: 'You get a link. Anyone with it plays on their own, any time. Best for practice and revision.' },
  live: { name: 'Live game', icon: 'live', desc: 'You get a room code. Everyone answers the same question together while you run the game.' },
  cbt: { name: 'CBT', icon: 'exam', desc: 'A timed CBT with a window and attempt limit. Each candidate gets a personal link.' },
};

const toIso = (v: string) => (v ? new Date(v).toISOString() : null);

/**
 * Turns a published quest into something people can take, one decision per screen:
 * 1. how they will take it, 2. how it is scored, 3. the few settings that apply. Participation (mode) and scoring (style) stay independent.
 */
export default function ActivityForm({ quizId, fixedMode, submitLabel = 'Create', defaults, onCreated }: { quizId: string; fixedMode?: Mode; submitLabel?: string; defaults?: { style?: 'points' | 'steps'; wrong?: 'stay' | 'down'; passMarkPercent?: number | null } | null; onCreated: (activity: any) => void }) {
  const [mode, setMode] = useState<Mode>(fixedMode ?? 'solo');
  const [style, setStyle] = useState<'points' | 'steps'>(defaults?.style ?? 'points');
  const [wrong, setWrong] = useState<'stay' | 'down'>(defaults?.wrong ?? 'stay');
  const [pass, setPass] = useState(defaults?.passMarkPercent != null ? String(defaults.passMarkPercent) : ''); const [instant, setInstant] = useState(false); const [secs, setSecs] = useState(30);
  const [opens, setOpens] = useState(''); const [closes, setCloses] = useState(''); const [duration, setDuration] = useState(30);
  const [attempts, setAttempts] = useState(1); const [release, setRelease] = useState<'immediate' | 'after_close' | 'manual'>('immediate'); const [showAnswers, setShowAnswers] = useState(true);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  const names = fixedMode ? ['Scoring', 'Settings'] : ['How', 'Scoring', 'Settings'];
  const [at, setAt] = useState(0);
  const page = names[at]!;
  const last = at === names.length - 1;

  const create = async () => {
    setError(''); setBusy(true);
    try {
      const body: any = { quizId, mode, style, steps: { wrong }, passMarkPercent: pass === '' ? null : Number(pass), showAnswers };
      if (mode === 'solo') body.instantFeedback = instant;
      if (mode === 'live') body.secondsPerQuestion = secs;
      if (mode === 'cbt') Object.assign(body, { opensAt: toIso(opens), closesAt: toIso(closes), durationMinutes: duration, attemptLimit: attempts, release });
      onCreated(await api('POST', '/activities', { body }));
    } catch (err) { setError(err instanceof ApiError ? err.message : 'Could not create'); } finally { setBusy(false); }
  };
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (last) void create(); else setAt(at + 1); };

  const choice = (on: boolean) => `block cursor-pointer rounded-2xl border-2 p-4 transition has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-sky ${on ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-primary/50'}`;

  return (
    <form className="space-y-5" onSubmit={submit}>
      <Stepper steps={names} current={at} onGo={setAt} />
      {error && <Notice kind="bad">{error}</Notice>}

      {page === 'How' && (
        <fieldset className="space-y-3">
          <legend className="text-lg font-extrabold">How will people take it?</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(MODE_TEXT) as Mode[]).filter((m) => m !== 'cbt').map((m) => (
              <label key={m} className={choice(mode === m)}>
                <input type="radio" className="sr-only" name="mode" checked={mode === m} onChange={() => setMode(m)} />
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-white"><Icon name={MODE_TEXT[m].icon} className="h-5 w-5" /></span>
                <span className="mt-2 block font-extrabold">{MODE_TEXT[m].name}</span>
                <span className="hint mt-1 block">{MODE_TEXT[m].desc}</span>
              </label>
            ))}
          </div>
          <p className="hint">Setting up a timed CBT? Customize CBT has its own place in the menu, with their own questions and schedule.</p>
        </fieldset>
      )}

      {page === 'Scoring' && (
        <div className="space-y-3">
          {defaults?.style && <Notice kind="info">Already set to <strong>{defaults.style === 'points' ? 'Points' : 'Steps'}</strong> from when you created the quest. Change it here if this one needs a different style.</Notice>}
          <ScoringChoice style={style} wrong={wrong} onStyle={setStyle} onWrong={setWrong} />
        </div>
      )}

      {page === 'Settings' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-extrabold">Last step: a few settings</h3>
            <p className="hint">{MODE_TEXT[mode].name} · {style === 'points' ? 'Points' : 'Steps'}. The defaults are fine, so you can create it as it is.</p>
          </div>
          {mode === 'live' && <Field label="Seconds per question" htmlFor="secs"><input id="secs" type="number" min={5} max={300} className="field" value={secs} onChange={(e) => setSecs(Number(e.target.value))} /></Field>}
          {mode === 'solo' && (
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 accent-[#5b3df5]" checked={instant} onChange={(e) => setInstant(e.target.checked)} />
              <span><span className="font-semibold">Instant feedback</span><span className="hint block">Each answer is checked and locked as soon as it is chosen. Off: learners can change answers until they submit.</span></span></label>
          )}
          {mode === 'cbt' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duration (minutes)" htmlFor="dur" hint="The CBT ends at this time even if the page is closed."><input id="dur" type="number" min={1} max={600} className="field" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></Field>
              <Field label="Attempts allowed" htmlFor="att"><input id="att" type="number" min={1} max={20} className="field" value={attempts} onChange={(e) => setAttempts(Number(e.target.value))} /></Field>
              <Field label="Release results" htmlFor="rel">
                <select id="rel" className="field" value={release} onChange={(e) => setRelease(e.target.value as typeof release)}>
                  <option value="immediate">Immediately after submission</option><option value="after_close">After the CBT closes</option><option value="manual">When I release them</option>
                </select>
              </Field>
              <Field label="Pass mark (% of marks)" htmlFor="pass" hint="Optional. Based on marks only."><input id="pass" type="number" min={0} max={100} className="field" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="e.g. 50" /></Field>
            </div>
          )}
          {mode !== 'cbt' && <Field label="Pass mark (% of marks, optional)" htmlFor="pass" hint="Based on marks only, never on points or steps."><input id="pass" type="number" min={0} max={100} className="field" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="e.g. 50" /></Field>}
          {mode === 'cbt' && (
            <details className="rounded-xl border border-line p-3">
              <summary className="cursor-pointer font-bold">Opening and closing times (optional)</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label="Opens" htmlFor="opens"><input id="opens" type="datetime-local" className="field" value={opens} onChange={(e) => setOpens(e.target.value)} /></Field>
                <Field label="Closes" htmlFor="closes"><input id="closes" type="datetime-local" className="field" value={closes} onChange={(e) => setCloses(e.target.value)} /></Field>
              </div>
            </details>
          )}
          {mode !== 'live' && (
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 accent-[#5b3df5]" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} />
              <span className="font-semibold">Show the correct answers in the result</span></label>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {at > 0 && <button type="button" className="btn btn-secondary" onClick={() => setAt(at - 1)}>Back</button>}
        <button className="btn btn-primary" disabled={busy}>{last ? submitLabel : 'Next'}</button>
      </div>
    </form>
  );
}
