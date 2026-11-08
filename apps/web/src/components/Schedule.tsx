import { useEffect, useState } from 'react';
import { Logo } from './ui';

export type StartMode = 'instant' | 'manual' | 'auto';

/** The clock, ticking. `skew` lines it up with the server's clock so a wrong phone clock does not shift the countdown. */
export function useNow(everyMs = 1000, skew = 0) {
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => { const t = setInterval(() => setNow(Date.now() + skew), everyMs); return () => clearInterval(t); }, [everyMs, skew]);
  return now;
}

/** "Friday 7 Nov, 3:00 PM (GMT+1)", in the viewer's own time zone. */
export function fmtWhen(iso: string) {
  const d = new Date(iso);
  const zone = new Intl.DateTimeFormat([], { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? '';
  return `${d.toLocaleString([], { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}${zone ? ` (${zone})` : ''}`;
}

export function fmtLeft(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/** A plain sentence for the host: when, and what happens at that time. */
export function scheduleLine(mode: StartMode, startsAt?: string | null) {
  if (mode === 'instant' || !startsAt) return 'Starts straight away. No schedule.';
  return mode === 'auto' ? `Starts by itself ${fmtWhen(startsAt)}.` : `Scheduled for ${fmtWhen(startsAt)}. You start it yourself.`;
}

/** What a visitor sees when they arrive before the start time: when it starts, a countdown, and when to come back. */
export function NotStarted({ title, startsAt, mode, serverNow, onReady, what = 'quest' }: { title: string; startsAt: string; mode: StartMode; serverNow?: number; onReady: () => void; what?: string }) {
  const skew = serverNow ? serverNow - Date.now() : 0;
  const now = useNow(1000, skew);
  const left = Date.parse(startsAt) - now;
  // when the time arrives (or passes), keep checking in case it has opened
  useEffect(() => { if (left > 0) return; onReady(); const t = setInterval(onReady, 8000); return () => clearInterval(t); }, [left > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card animate-rise space-y-4 text-center" role="status">
      <div className="mx-auto w-fit"><Logo size={52} /></div>
      <div>
        <p className="font-display text-sm font-extrabold uppercase tracking-[0.18em] text-primary">Not started yet</p>
        <h1 className="mt-1 text-3xl">{title}</h1>
      </div>
      <p className="text-lg">This {what} has not started yet. It starts on</p>
      <p className="font-brand text-2xl font-extrabold">{fmtWhen(startsAt)}</p>
      {left > 0 ? (
        <div className="mx-auto w-fit rounded-2xl bg-primary-soft px-6 py-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Starts in</p>
          <p className="font-brand text-4xl font-extrabold tabular-nums text-primary">{fmtLeft(left)}</p>
        </div>
      ) : (
        <p className="rounded-2xl bg-sun/25 px-4 py-3 font-semibold">{mode === 'auto' ? 'It is starting now…' : 'The time has come. Waiting for the host to start it…'} This page opens it for you when it is ready.</p>
      )}
      <p className="hint">Come back at that time{left > 0 ? ', or keep this page open and it will update by itself' : ''}.</p>
    </div>
  );
}

/** Instant, or scheduled with a manual or automatic start. Used when creating a quest and when changing its schedule. */
export function ScheduleFields({ mode, at, onMode, onAt, noun }: { mode: StartMode; at: string; onMode: (m: StartMode) => void; onAt: (v: string) => void; noun: string }) {
  const opts: { v: StartMode; title: string; text: string }[] = [
    { v: 'instant', title: 'Instant', text: `No date or time. ${noun} is ready as soon as you create it.` },
    { v: 'manual', title: 'Scheduled · I start it', text: 'People who arrive early are told when it starts. At that time you press the start button yourself.' },
    { v: 'auto', title: 'Scheduled · start automatically', text: 'It starts by itself at the time, even if you are not on the page.' },
  ];
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <fieldset className="space-y-2">
      <legend className="label">When does it start?</legend>
      <div className="grid gap-2">
        {opts.map((o) => (
          <label key={o.v} className={`block cursor-pointer rounded-2xl border-2 p-3 transition has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-sky ${mode === o.v ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-primary/50'}`}>
            <input type="radio" className="sr-only" name="startmode" checked={mode === o.v} onChange={() => onMode(o.v)} />
            <span className="block font-extrabold">{o.title}</span><span className="hint block">{o.text}</span>
          </label>
        ))}
      </div>
      {mode !== 'instant' && (
        <div><label className="label" htmlFor="startsat">Date and time</label>
          <input id="startsat" type="datetime-local" className="field" value={at} onChange={(e) => onAt(e.target.value)} required />
          <p className="hint mt-1">In your time zone ({zone}). Visitors see it in theirs.</p></div>
      )}
    </fieldset>
  );
}

/** In the lobby: when the game starts, a countdown, and who presses the button. */
export function LobbySchedule({ schedule, host = false, dark = false }: { schedule: { mode: StartMode; startsAt: string | null; due: boolean }; host?: boolean; dark?: boolean }) {
  const now = useNow(1000);
  if (schedule.mode === 'instant' || !schedule.startsAt) return null;
  const left = Date.parse(schedule.startsAt) - now;
  const text = left > 0
    ? `${schedule.mode === 'auto' ? 'Starts by itself' : host ? 'You start it' : 'The host starts it'} at ${fmtWhen(schedule.startsAt)}`
    : schedule.mode === 'auto' ? 'The time has come. Starting now…' : host ? 'It is time. Press Start when you are ready.' : 'It is time. Waiting for the host to start.';
  return (
    <div role="status" className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 ${dark ? 'bg-white/15 text-white' : 'bg-sun/25'}`}>
      <p className="min-w-0 font-semibold">{text}</p>
      {left > 0 && <span className={`font-brand text-2xl font-extrabold tabular-nums ${dark ? 'text-sun' : 'text-primary'}`}>{fmtLeft(left)}</span>}
    </div>
  );
}
