import type { ReactNode } from 'react';

export function Notice({ kind = 'info', children, role }: { kind?: 'info' | 'ok' | 'warn' | 'bad'; children: ReactNode; role?: string }) {
  return <div className={`notice notice-${kind}`} role={role ?? (kind === 'bad' ? 'alert' : 'status')}>{children}</div>;
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="hint mt-1">{hint}</p>}
    </div>
  );
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <p className="hint py-8 text-center" role="status">{what}…</p>;
}

/** Brand mark: three rising blocks. Decorative, so it is hidden from assistive tech. */
export function Logo({ light = false, size = 36 }: { light?: boolean; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="11" fill={light ? '#ffffff' : '#5b3df5'} />
      <rect x="7" y="23" width="7" height="10" rx="2" fill="#ffc933" />
      <rect x="16.5" y="16" width="7" height="17" rx="2" fill="#ff6b6b" />
      <rect x="26" y="8" width="7" height="25" rx="2" fill={light ? '#5b3df5' : '#ffffff'} />
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  solo: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>,
  live: <><circle cx="12" cy="12" r="2" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></>,
  exam: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6" /></>,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  spark: <path d="M12 3l2.2 6.3L21 12l-6.8 2.7L12 21l-2.2-6.3L3 12l6.8-2.7z" />,
  check: <path d="M5 13l4 4L19 7" />,
};

export function Icon({ name, className = 'h-6 w-6' }: { name: keyof typeof ICONS; className?: string }) {
  return <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>;
}

/** Answer option colours, cycled by position. Letters are decorative: the option text is the accessible name. */
const OPT_COLORS = ['bg-primary', 'bg-coral', 'bg-sky', 'bg-sun !text-ink', 'bg-accent', 'bg-ink'];
export function OptionBadge({ index }: { index: number }) {
  return <span aria-hidden className={`opt-badge ${OPT_COLORS[index % OPT_COLORS.length]}`}>{String.fromCharCode(65 + index)}</span>;
}

const STEP_COLORS = ['bg-primary', 'bg-sky', 'bg-accent', 'bg-sun', 'bg-coral'];

/**
 * Steps staircase: a rising block per step, coloured up to the player's position, with a pawn standing on the current block.
 * The label text carries the same information, so colour and animation are never the only signal. Flex columns shrink to any phone width.
 */
export function StepTrack({ position, max, label = 'Step' }: { position: number; max: number; label?: string }) {
  const n = Math.max(1, max);
  const at = Math.min(Math.max(0, position), n);
  const heightOf = (i: number) => 24 + ((i + 1) / n) * 76; // percent of the track
  return (
    <div aria-label={`${label} ${position} of ${n}`} role="img" className="w-full">
      <div className="mb-1 flex items-baseline justify-between text-sm font-bold">
        <span>{label} {position}</span><span className="text-muted">of {n}</span>
      </div>
      <div className="relative h-24 sm:h-28">
        <div className="absolute inset-0 flex items-end gap-0.5">
          {Array.from({ length: n }, (_, i) => (
            <div key={i} style={{ height: `${heightOf(i)}%` }} className={`flex-1 rounded-t-md transition-colors duration-500 ${i < at ? STEP_COLORS[i % STEP_COLORS.length] : 'bg-[#e4e0fb]'}`} />
          ))}
        </div>
        <div
          className="absolute z-10 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full border-[3px] border-ink bg-white shadow-md transition-[left,bottom] duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
          style={{ left: at === 0 ? '1rem' : `${((at - 0.5) / n) * 100}%`, bottom: at === 0 ? '0%' : `calc(${heightOf(at - 1)}% + 2px)` }}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-coral" />
        </div>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-[0_8px_20px_-16px_rgba(23,19,71,0.4)]">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="text-3xl font-extrabold text-primary">{value}</p>
      {sub && <p className="hint">{sub}</p>}
    </div>
  );
}

export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const pct = (n?: number | null) => (n == null ? '—' : `${Math.round(n * 10) / 10}%`);
