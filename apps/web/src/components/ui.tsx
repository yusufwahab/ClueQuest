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
        <input id={id} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className={`field min-w-0 flex-1 ${big ? 'text-center text-3xl font-extraboldst' : 'text-sm'}`} />
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
            <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-extrabold ${state === 'next' ? 'bg-[#e4e0fb] text-muted' : state === 'done' ? 'bg-primary-dark text-white' : 'bg-primary text-white'}`}>{state === 'done' ? '✓' : i + 1}</span>
            <span className={`truncate text-sm font-bold ${state === 'now' ? 'text-ink' : 'text-muted'} ${state === 'now' ? '' : 'hidden sm:inline'}`}>{s}</span>
          </>
        );
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-2" aria-current={state === 'now' ? 'step' : undefined}>
            {state === 'done' && onGo ? <button type="button" className="flex min-w-0 items-center gap-2" onClick={() => onGo(i)}>{body}</button> : <span className="flex min-w-0 items-center gap-2">{body}</span>}
            {i < steps.length - 1 && <span aria-hidden className={`h-0.5 flex-1 ${i < current ? 'bg-primary-dark' : 'bg-[#e4e0fb]'}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Decorative floating shapes shared by the landing page, sign-in and page banners. Hidden from assistive tech. */
export function Shapes({ small = false }: { small?: boolean }) {
  return (
    <>
      <div aria-hidden className={`absolute animate-float rounded-full bg-[#7a3cff]/40 blur-3xl ${small ? '-right-8 -top-12 h-40 w-40' : '-right-16 -top-16 h-64 w-64'}`} />
      <div aria-hidden className={`absolute animate-float rounded-full bg-primary/50 blur-3xl [animation-delay:1.5s] ${small ? '-bottom-14 right-28 h-28 w-28' : '-bottom-20 left-1/3 h-56 w-56'}`} />
      <div aria-hidden className={`absolute hidden rotate-12 rounded-lg bg-sun/90 sm:block ${small ? 'bottom-5 right-8 h-8 w-8' : 'left-6 top-40 h-10 w-10'}`} />
    </>
  );
}

/** Full-height gradient page for screens a learner or new host lands on (sign-in, join, entry). */
export function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div className="hero-bg relative min-h-screen overflow-hidden">
      <Shapes />
      <div className="relative">{children}</div>
    </div>
  );
}

/** Page banner: gradient title block with a plain "back" link, so a new user always knows where they are and how to return. */
export function PageHead({ title, sub, back, actions }: { title: ReactNode; sub?: ReactNode; back?: { to: string; label: string }; actions?: ReactNode }) {
  return (
    <header className="hero-bg relative overflow-hidden rounded-3xl p-5 text-white shadow-[0_20px_40px_-24px_rgba(58,31,176,0.9)] sm:p-7">
      <Shapes small />
      <div className="relative space-y-1">
        {back && <Link to={back.to} className="btn-quiet min-h-9! px-0! text-sm text-white/90!">← {back.label}</Link>}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h1 className="text-3xl sm:text-4xl">{title}</h1>{sub && <p className="mt-2 text-base font-semibold text-white/90">{sub}</p>}</div>
          {actions && <div className="flex flex-wrap gap-2 [&_.btn-primary]:bg-sun [&_.btn-primary]:text-ink [&_.btn-primary:hover]:bg-sun">{actions}</div>}
        </div>
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
  plus: <path d="M12 5v14M5 12h14" />,
  home: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  bolt: <path d="M13 2L4 14h7l-1 8 9-12h-7z" />,
  bell: <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" />,
  cross: <path d="M6 6l12 12M18 6L6 18" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />,
  out: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
};

export function Icon({ name, className = 'h-6 w-6' }: { name: keyof typeof ICONS; className?: string }) {
  return <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>;
}

/** Answer option colours, cycled by position. Letters are decorative: the option text is the accessible name. */
const OPT_COLORS = ['bg-primary', 'bg-coral', 'bg-sky', 'bg-sun !text-ink', 'bg-accent', 'bg-ink'];
export function OptionBadge({ index }: { index: number }) {
  return <span aria-hidden className={`opt-badge ${OPT_COLORS[index % OPT_COLORS.length]}`}>{String.fromCharCode(65 + index)}</span>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-[0_8px_20px_-16px_rgba(23,19,71,0.4)]">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="font-brand text-3xl font-extrabold text-primary">{value}</p>
      {sub && <p className="hint">{sub}</p>}
    </div>
  );
}

export const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const pct = (n?: number | null) => (n == null ? '—' : `${Math.round(n * 10) / 10}%`);
