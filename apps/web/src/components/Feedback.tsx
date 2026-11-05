import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, Shapes } from './ui';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const CONFETTI = ['#ffc933', '#ff6b6b', '#38b6ff', '#12b886', '#ffffff'];

/** A burst of small squares. Pure CSS, decorative, and switched off by reduced motion (see index.css). */
export function Confetti({ n = 14, spread = 70 }: { n?: number; spread?: number }) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2, d = spread + ((i * 37) % 45);
        return <i key={i} className="burst absolute left-1/2 top-1/2 block h-2.5 w-2.5 rounded-sm" style={{ background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 4) * 30}ms`, ['--dx' as string]: `${Math.cos(a) * d}px`, ['--dy' as string]: `${Math.sin(a) * d}px` } as CSSProperties} />;
      })}
    </span>
  );
}

/* ------------------------------------------------------------ answer pop-up */

export interface PopEvent { id: number; kind: 'correct' | 'wrong' | 'timeout'; detail?: string; streak?: number }

const PRAISE = ['Nice, correct!', 'Superb!', 'Brilliant!', 'You nailed it!', 'Great job!', 'Spot on!', 'Awesome!'];
const OOPS = ['Not quite', 'So close!', 'Oops!', 'Almost there', 'Keep going!'];

/** Returns the latest event and a function to fire one. A tiny vibration on phones, where supported. */
export function useAnswerPop() {
  const [event, setEvent] = useState<PopEvent | null>(null);
  const n = useRef(0);
  const show = useCallback((kind: PopEvent['kind'], detail?: string, streak?: number) => {
    n.current += 1;
    setEvent({ id: n.current, kind, detail, streak });
    if (!reduced()) try { navigator.vibrate?.(kind === 'correct' ? 20 : [30, 50, 30]); } catch { /* not supported */ }
  }, []);
  return [event, show] as const;
}

/** The "Nice, correct!" / "Not quite" bubble. It never blocks taps and goes away by itself; screen readers hear it as a polite status. */
export function AnswerPop({ event }: { event: PopEvent | null }) {
  const [shown, setShown] = useState<PopEvent | null>(null);
  useEffect(() => {
    if (!event) return;
    setShown(event);
    const t = setTimeout(() => setShown((s) => (s?.id === event.id ? null : s)), 1900);
    return () => clearTimeout(t);
  }, [event]);
  if (!shown) return <div role="status" aria-live="polite" className="sr-only" />;

  const ok = shown.kind === 'correct';
  const hot = ok && (shown.streak ?? 0) >= 3;
  const title = shown.kind === 'timeout' ? "Time's up" : ok ? (hot ? `On fire! ${shown.streak} in a row` : PRAISE[shown.id % PRAISE.length]!) : OOPS[shown.id % OOPS.length]!;
  const tone = ok ? 'from-[#12b886] to-[#0b9a6f]' : shown.kind === 'timeout' ? 'from-[#f08c00] to-[#d9730d]' : 'from-[#ff6b6b] to-[#e03131]';
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[28vh] z-50 flex justify-center px-4">
      <div key={shown.id} className={`${ok ? 'pop-in' : 'wobble'} relative flex items-center gap-3 rounded-3xl bg-gradient-to-br ${tone} px-5 py-3 text-white shadow-[0_18px_40px_-12px_rgba(23,19,71,0.55)]`}>
        <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/25"><Icon name={ok ? 'check' : shown.kind === 'timeout' ? 'exam' : 'cross'} className="h-7 w-7" /></span>
        <span>
          <span className="block font-display text-2xl font-bold leading-tight">{title}</span>
          {shown.detail && <span className="mt-0.5 inline-block rounded-full bg-white/25 px-2.5 py-0.5 text-sm font-bold">{shown.detail}</span>}
        </span>
        {ok && <Confetti />}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- score card */

export function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(reduced() ? target : 0);
  useEffect(() => {
    if (reduced()) { setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / ms); setV(Math.round(target * (1 - (1 - p) ** 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const GRADES = [
  { min: 1, title: 'Perfect score!', sub: 'Not a single slip. Take a bow.', stars: 3 },
  { min: 0.85, title: 'Superb work!', sub: 'You really know this one.', stars: 3 },
  { min: 0.6, title: 'Great job!', sub: 'A solid result. One more go for the top?', stars: 2 },
  { min: 0.3, title: 'Good effort!', sub: 'You are getting there. Try again to beat it.', stars: 1 },
  { min: 0, title: 'Keep practising', sub: 'Every attempt makes the next one easier.', stars: 0 },
] as const;

/** The big Points result: animated count-up, a filling ring, stars and a message that fits how it went. */
export function ScoreCard({ points, possible, label = 'Points earned', children }: { points: number; possible: number; label?: string; children?: ReactNode }) {
  const ratio = possible > 0 ? Math.min(1, points / possible) : 0;
  const grade = GRADES.find((g) => ratio >= g.min)!;
  const shown = useCountUp(points);
  const [go, setGo] = useState(reduced());
  useEffect(() => { const id = requestAnimationFrame(() => setGo(true)); return () => cancelAnimationFrame(id); }, []);
  const R = 56, C = 2 * Math.PI * R;
  return (
    <section className="hero-bg relative overflow-hidden rounded-3xl p-5 text-white shadow-[0_20px_40px_-24px_rgba(58,31,176,0.9)] sm:p-7" aria-label="Points result">
      <Shapes small />
      {ratio >= 0.85 && <Confetti n={18} spread={110} />}
      <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <div className="relative grid h-40 w-40 shrink-0 place-items-center">
          <svg viewBox="0 0 140 140" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="70" cy="70" r={R} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="12" />
            <circle cx="70" cy="70" r={R} fill="none" stroke="#ffc933" strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (go ? ratio : 0))} style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)' }} />
          </svg>
          <div>
            <span className="block font-display text-5xl font-bold leading-none tabular-nums">{shown}</span>
            <span className="mt-1 block text-sm font-bold text-white/85">of {possible}</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-widest text-white/80">{label}</p>
          <h2 className="mt-1 font-display text-3xl font-bold text-white sm:text-4xl">{grade.title}</h2>
          <p className="mt-1 font-semibold text-white/90">{grade.sub}</p>
          <div className="mt-3 flex justify-center gap-1.5 sm:justify-start" aria-hidden>
            {[0, 1, 2].map((i) => (
              <svg key={i} viewBox="0 0 24 24" className={`h-9 w-9 ${i < grade.stars ? 'pop-in text-sun' : 'text-white/25'}`} style={{ animationDelay: `${0.35 + i * 0.2}s` }} fill="currentColor"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" /></svg>
            ))}
          </div>
          {children && <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">{children}</div>}
        </div>
      </div>
    </section>
  );
}

/** A small white-on-glass pill for facts that sit on a ScoreCard, such as marks. */
export function ScoreChip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold">{children}</span>;
}
