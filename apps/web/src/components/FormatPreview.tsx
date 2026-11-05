import { useEffect, useState } from 'react';
import { OptionBadge } from './ui';
import { StepRace, StepScene, avatarColor } from './StepScene';
import { useCountUp } from './Feedback';

/**
 * Small "this is what it looks like while playing" demos for the two scoring formats, used on the landing page and in the format picker.
 * They are decorative (the surrounding text says the same thing), so they are hidden from assistive tech, and they stand still
 * unless `animate` is set and the device has not asked for reduced motion.
 */
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function useTicker(ms: number, on: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on || reduced()) return;
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms, on]);
  return n;
}

const ROUNDS = [
  { q: 'Which planet is closest to the Sun?', opts: ['Venus', 'Mercury', 'Mars'], right: 1, pts: 200 },
  { q: 'What do plants take in from the air?', opts: ['Oxygen', 'Carbon dioxide', 'Helium'], right: 1, pts: 100 },
  { q: 'How many legs does a spider have?', opts: ['6', '8', '10'], right: 1, pts: 250 },
];
const BASE = 800;
const BOARD = [{ id: 'a', nickname: 'Ada', pts: 1250 }, { id: 'b', nickname: 'Ben', pts: 1050 }, { id: 'c', nickname: 'Chi', pts: 800 }];

/** A mock live question: the right answer lights up, "+200" pops out and the score ticks up. */
export function PointsPreview({ compact = false, animate = false }: { compact?: boolean; animate?: boolean }) {
  const tick = useTicker(3200, animate);
  const r = tick % ROUNDS.length;
  const round = ROUNDS[r]!;
  const score = BASE + ROUNDS.slice(0, r + 1).reduce((n, x) => n + x.pts, 0);
  const shown = useCountUp(score, 700);
  return (
    <div aria-hidden className="rounded-2xl bg-gradient-to-b from-primary-soft to-white p-3 ring-1 ring-line">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted">Question {r + 3} of 8</span>
        <span className="rounded-full bg-primary px-3 py-1 text-sm font-extrabold tabular-nums text-white">★ {shown.toLocaleString('en-US')}</span>
      </div>
      <p className={`mt-2 font-display font-semibold leading-snug ${compact ? 'text-sm' : 'text-base'}`}>{round.q}</p>
      <div className="mt-2 space-y-1.5">
        {round.opts.map((o, i) => {
          const right = i === round.right;
          return (
            <div key={`${r}-${o}`} className={`relative flex items-center gap-2 rounded-xl border-2 ${compact ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-sm'} font-bold ${right ? 'border-accent bg-accent-soft' : 'border-line bg-white'}`}>
              <span className="scale-75"><OptionBadge index={i} /></span>
              <span className="flex-1">{o}</span>
              {right && <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
              {right && <span key={`p${r}`} className="pop-in absolute -top-2.5 right-6 rounded-full bg-sun px-2 py-0.5 text-xs font-extrabold text-ink shadow">+{round.pts}</span>}
            </div>
          );
        })}
      </div>
      {!compact && (
        <div className="mt-3 space-y-1.5 border-t border-line pt-2.5">
          {BOARD.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 text-xs font-bold">
              <span className="w-3 text-muted">{i + 1}</span>
              <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] text-white" style={{ background: avatarColor(p.id) }}>{p.nickname[0]}</span>
              <span className="w-8">{p.nickname}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-line"><span className="block h-full rounded-full bg-primary" style={{ width: `${(p.pts / 1250) * 100}%` }} /></span>
              <span className="w-10 text-right tabular-nums">{p.pts.toLocaleString('en-US')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const FRIENDS = [{ id: 'a', nickname: 'Ada', step: 7 }, { id: 'b', nickname: 'Ben', step: 6 }, { id: 'c', nickname: 'Chi', step: 1 }];
const CLIMB = [2, 3, 4, 5, 6];

/** The staircase as a player sees it, with the hero climbing, and (unless compact) the whole class on one staircase underneath. */
export function StepsPreview({ compact = false, animate = false }: { compact?: boolean; animate?: boolean }) {
  const tick = useTicker(2600, animate);
  const at = animate ? CLIMB[tick % CLIMB.length]! : 4;
  return (
    <div aria-hidden className="space-y-2">
      <StepScene decorative variant={compact ? 'compact' : 'banner'} position={at} max={8} others={FRIENDS} />
      {!compact && <StepRace racers={[...FRIENDS, { id: 'me', nickname: 'You', step: at }]} max={8} meId="me" />}
    </div>
  );
}
