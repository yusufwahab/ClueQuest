import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

/** Copies text. Falls back to a hidden textarea where the async clipboard is unavailable (plain http, older phones). */
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const t = document.createElement('textarea');
  t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select();
  try { return document.execCommand('copy'); } finally { t.remove(); }
}

/** One-tap copy with visible and announced confirmation. */
export function CopyButton({ value, label = 'Copy', what, className = 'btn btn-secondary' }: { value: string; label?: string; what?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const click = async () => {
    if (await copyText(value)) { setDone(true); clearTimeout(timer.current); timer.current = setTimeout(() => setDone(false), 2000); }
  };
  return (
    <button type="button" className={`${className} shrink-0`} onClick={click} aria-label={what ? `${label} ${what}` : undefined}>
      {done ? '✓ Copied' : label}
      <span className="sr-only" role="status">{done ? `${what ?? 'Text'} copied` : ''}</span>
    </button>
  );
}

/** A read-only value (link, code, ID) with a plain-words label and a copy button right next to it. */
export function CopyField({ label, value, hint, big = false, openable = false }: { label: string; value: string; hint?: string; big?: boolean; openable?: boolean }) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className={`field min-w-0 flex-1 ${big ? 'text-center text-3xl font-extrabold tracking-widest' : 'text-sm'}`} />
        <div className="flex gap-2">
          <CopyButton value={value} what={label.toLowerCase()} className="btn btn-primary flex-1 sm:flex-none" />
          {openable && <a className="btn btn-secondary" href={value} target="_blank" rel="noreferrer">Open</a>}
        </div>
      </div>
      {hint && <p className="hint mt-1">{hint}</p>}
    </div>
  );
}

/** Dialog for the small, focused tasks that should not crowd a page. Esc, the close button and the backdrop all close it. */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && box.current) { // keep focus inside the dialog
        const f = [...box.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select,textarea')];
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    document.body.style.overflow = 'hidden';
    box.current?.querySelector<HTMLElement>('input,textarea,select')?.focus();
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = ''; prev?.focus(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-secondary !min-h-10 !px-3" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** "1 Basics → 2 Questions → 3 Publish" progress strip. Steps already reached can be clicked to go back. */
export function Stepper({ steps, current, onGo }: { steps: string[]; current: number; onGo?: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-1 sm:gap-2" aria-label="Progress">
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'next';
        const body = (
          <>
            <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-extrabold ${state === 'next' ? 'bg-[#e4e0fb] text-muted' : state === 'done' ? 'bg-accent text-white' : 'bg-primary text-white'}`}>{state === 'done' ? '✓' : i + 1}</span>
            <span className={`truncate text-sm font-bold ${state === 'now' ? 'text-ink' : 'text-muted'} ${state === 'now' ? '' : 'hidden sm:inline'}`}>{s}</span>
          </>
        );
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-2" aria-current={state === 'now' ? 'step' : undefined}>
            {state === 'done' && onGo ? <button type="button" className="flex min-w-0 items-center gap-2" onClick={() => onGo(i)}>{body}</button> : <span className="flex min-w-0 items-center gap-2">{body}</span>}
            {i < steps.length - 1 && <span aria-hidden className={`h-0.5 flex-1 ${i < current ? 'bg-accent' : 'bg-[#e4e0fb]'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Page title with a plain "back" link so a new user always knows where they are and how to return. */
export function PageHead({ title, sub, back, actions }: { title: ReactNode; sub?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode }) {
  return (
    <header className="space-y-1">
      {back && <Link to={back.to} className="btn-quiet !min-h-9 !px-0 text-sm">← {back.label}</Link>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h1>{title}</h1>{sub && <p className="hint mt-1">{sub}</p>}</div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

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
