import { Field } from './ui';

/** The schedule and rules of an exam, as the forms edit them (dates are the browser's local "datetime-local" strings). */
export interface ExamSettings {
  opens: string; closes: string; duration: number; attempts: number; pass: string;
  release: 'immediate' | 'after_close' | 'manual'; showAnswers: boolean; access: 'link' | 'invited';
}
export const defaultExamSettings: ExamSettings = { opens: '', closes: '', duration: 60, attempts: 1, pass: '', release: 'manual', showAnswers: false, access: 'link' };

const zone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'your device time'; } })();
const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const when = (v: string) => new Date(v).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** What an existing exam's saved settings look like in the form. */
export function fromActivity(s: any): ExamSettings {
  return {
    opens: toLocalInput(s?.opensAt), closes: toLocalInput(s?.closesAt), duration: s?.durationMinutes ?? 60, attempts: s?.attemptLimit ?? 1,
    pass: s?.passMarkPercent == null ? '' : String(s.passMarkPercent), release: s?.release ?? 'manual', showAnswers: !!s?.showAnswers, access: s?.access === 'link' ? 'link' : 'invited',
  };
}

/** What the server is sent. */
export const examBody = (s: ExamSettings) => ({
  opensAt: s.opens ? new Date(s.opens).toISOString() : null, closesAt: s.closes ? new Date(s.closes).toISOString() : null, durationMinutes: s.duration,
  attemptLimit: s.attempts, passMarkPercent: s.pass === '' ? null : Number(s.pass), release: s.release, showAnswers: s.showAnswers, access: s.access,
});

/** A plain-words problem with the schedule, or an empty string when it is fine. `allowPast` is for editing an exam that already opened. */
export function scheduleProblem(s: ExamSettings, allowPast = false): string {
  if (!Number.isInteger(s.duration) || s.duration < 1 || s.duration > 600) return 'Time allowed must be between 1 and 600 minutes.';
  if (s.opens && s.closes && new Date(s.closes) <= new Date(s.opens)) return 'The closing time must be after the opening time.';
  if (!allowPast && s.closes && new Date(s.closes) <= new Date()) return 'The closing time has already passed.';
  if (!Number.isInteger(s.attempts) || s.attempts < 1 || s.attempts > 20) return 'Attempts allowed must be between 1 and 20.';
  if (s.pass !== '' && (Number(s.pass) < 0 || Number(s.pass) > 100)) return 'The pass mark must be between 0 and 100.';
  return '';
}

type P = { value: ExamSettings; onChange: (p: Partial<ExamSettings>) => void };

export function ScheduleStep({ value: s, onChange }: P) {
  const windowMin = s.opens && s.closes ? (new Date(s.closes).getTime() - new Date(s.opens).getTime()) / 60000 : null;
  const summary = [
    s.opens ? `Candidates can start from ${when(s.opens)}.` : 'Candidates can start as soon as they get their invitation.',
    s.closes ? `Nobody can start after ${when(s.closes)}, and any CBT still running is submitted automatically at that time.` : 'There is no closing time.',
    `Each candidate gets ${s.duration} minute${s.duration === 1 ? '' : 's'}, counted from the moment they press Start.`,
  ];
  return (
    <section className="card space-y-4" aria-label="Schedule">
      <div><h2>When does the CBT run?</h2><p className="hint mt-1">Times are in your time zone ({zone}). Candidates see them in theirs.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Opens" htmlFor="ex-opens" hint="Leave empty to open straight away."><input id="ex-opens" type="datetime-local" className="field" value={s.opens} onChange={(e) => onChange({ opens: e.target.value })} /></Field>
        <Field label="Closes" htmlFor="ex-closes" hint="Leave empty for no closing time."><input id="ex-closes" type="datetime-local" className="field" value={s.closes} onChange={(e) => onChange({ closes: e.target.value })} /></Field>
      </div>
      <Field label="Time allowed (minutes)" htmlFor="ex-dur" hint="Each candidate's own clock starts when they press Start. The server ends it on time, even if they close the page.">
        <input id="ex-dur" type="number" min={1} max={600} className="field sm:max-w-48" value={s.duration} onChange={(e) => onChange({ duration: Number(e.target.value) })} />
      </Field>
      <div className="rounded-xl border-2 border-line bg-primary-soft/50 p-4">
        <p className="font-display font-semibold">What candidates will experience</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{summary.map((x) => <li key={x}>{x}</li>)}</ul>
        {windowMin != null && windowMin < s.duration && <p className="mt-2 text-sm font-semibold text-warn">The window ({Math.round(windowMin)} min) is shorter than the time allowed, so late starters will be cut off at the closing time.</p>}
      </div>
    </section>
  );
}

export function RulesStep({ value: s, onChange }: P) {
  return (
    <section className="card space-y-4" aria-label="Rules and results">
      <div><h2>Rules and results</h2><p className="hint mt-1">CBTs are graded by marks. You choose when candidates see their results.</p></div>
      <fieldset className="space-y-2">
        <legend className="label">Who can take it?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {([['link', 'Anyone with the link', 'You get a link to share or copy. Candidates enter their name and an email or ID before they start. You can also invite people by email.'], ['invited', 'Only people I invite', 'Each candidate gets a personal link by email. Nobody else can open the CBT.']] as const).map(([v, name, desc]) => (
            <label key={v} className={`block cursor-pointer rounded-2xl border-2 p-4 transition has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-sky ${s.access === v ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-primary/50'}`}>
              <input type="radio" className="sr-only" name="access" checked={s.access === v} onChange={() => onChange({ access: v })} />
              <span className="font-display text-lg font-semibold">{name}</span><span className="hint mt-1 block">{desc}</span>
            </label>
          ))}
        </div>
        {s.access === 'link' && <p className="hint">With a shared link, attempts are counted by the email or ID each candidate types.</p>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Attempts allowed" htmlFor="ex-att" hint="Per candidate."><input id="ex-att" type="number" min={1} max={20} className="field" value={s.attempts} onChange={(e) => onChange({ attempts: Number(e.target.value) })} /></Field>
        <Field label="Pass mark (% of marks)" htmlFor="ex-pass" hint="Optional. Leave empty for no pass or fail."><input id="ex-pass" type="number" min={0} max={100} className="field" value={s.pass} onChange={(e) => onChange({ pass: e.target.value })} placeholder="e.g. 50" /></Field>
      </div>
      <Field label="When do candidates see their results?" htmlFor="ex-rel">
        <select id="ex-rel" className="field" value={s.release} onChange={(e) => onChange({ release: e.target.value as ExamSettings['release'] })}>
          <option value="manual">When I release them</option>
          <option value="after_close">After the CBT closes</option>
          <option value="immediate">Straight after they submit</option>
        </select>
      </Field>
      <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 accent-[#5b3df5]" checked={s.showAnswers} onChange={(e) => onChange({ showAnswers: e.target.checked })} />
        <span><span className="font-semibold">Show the correct answers with the results</span><span className="hint block">Leave this off if the questions will be reused.</span></span></label>
    </section>
  );
}
