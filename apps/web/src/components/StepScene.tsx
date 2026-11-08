import { useEffect, useId, useRef } from 'react';
import { defaultAvatar, normaliseAvatar, type Avatar } from '@cluequest/game-core';
import { AvatarArt, AvatarView, avatarMain } from './Avatar';

/**
 * The Steps visuals.
 *  - StepScene: one player's climb, drawn as a bright staircase going up into the light with a little hero on the current step.
 *  - StepRace: every player on one side-on staircase, so everyone sees where everyone else is.
 * Both are plain SVG/CSS (no images, no libraries), move with transforms only, scale to any screen and honour reduced motion.
 */
export interface Racer { id: string; nickname: string; step: number; avatar?: Avatar }
const lookOf = (who: { nickname: string; avatar?: Avatar | null }) => normaliseAvatar(who.avatar) ?? defaultAvatar(who.nickname);

const STEP_COLORS = [['#5b3df5', '#8b73ff'], ['#38b6ff', '#8bd6ff'], ['#12b886', '#5fddb4'], ['#ffc933', '#ffe07a'], ['#ff6b6b', '#ff9d9d']] as const;
const AVATARS = ['#5b3df5', '#ff6b6b', '#12b886', '#38b6ff', '#f08c00', '#d6336c', '#7048e8', '#0b7285'];
export function avatarColor(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATARS[h % AVATARS.length]!; }
type Rgb = readonly [number, number, number];
const RISER_LOW: Rgb = [196, 184, 255], RISER_HIGH: Rgb = [58, 31, 176];
const mixRgb = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const rgb = (c: Rgb) => `rgb(${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])})`;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------------------------------------------------------- StepScene */

// Perspective is faked with a geometric series: each step further away is S times the size, shrinking towards the vanishing point.
// Moving up one step is then the same picture scaled by S about that point, which is what makes the climb a single cheap transform.
const VX = 200, VY = 36, A = 330, S = 0.82, HW = 150, AHEAD = 9;
const edge = (k: number) => ({ y: VY + A * S ** k, hw: HW * S ** k });

function Hero() {
  return (
    <g>
      <ellipse cx="0" cy="2" rx="28" ry="6" fill="#171347" opacity="0.22" />
      <rect x="-15" y="-28" width="12" height="28" rx="5" fill="#2b2370" />
      <rect x="3" y="-28" width="12" height="28" rx="5" fill="#2b2370" />
      <ellipse cx="-9" cy="-1" rx="9" ry="5" fill="#171347" />
      <ellipse cx="9" cy="-1" rx="9" ry="5" fill="#171347" />
      <path className="scarf" d="M-14 -70 q-30 4 -40 28 q14 -8 34 -10z" fill="#38b6ff" />
      <rect x="-28" y="-70" width="10" height="30" rx="5" fill="#ff6b6b" />
      <rect x="18" y="-70" width="10" height="30" rx="5" fill="#ff6b6b" />
      <rect x="-21" y="-74" width="42" height="50" rx="15" fill="#ff6b6b" />
      <rect x="-15" y="-68" width="30" height="32" rx="9" fill="#ffc933" />
      <rect x="-15" y="-55" width="30" height="4" fill="#c99700" />
      <rect x="-5" y="-80" width="10" height="9" rx="3" fill="#e8b48f" />
      <circle cx="0" cy="-93" r="18" fill="#3b2a20" />
      <rect x="-18" y="-98" width="36" height="7" rx="3.5" fill="#ffc933" />
    </g>
  );
}

function Pawn({ x, y, r, who }: { x: number; y: number; r: number; who: Racer }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r * 1.04} fill="#fff" />
      <svg x={x - r} y={y - r} width={r * 2} height={r * 2} viewBox="2 -12 96 110" overflow="visible"><AvatarArt a={lookOf(who)} /></svg>
    </g>
  );
}

/** The player's own character, seen from the front as they stand on their step: their colour, face and hat on a little body. */
function HeroAvatar({ avatar }: { avatar: Avatar }) {
  const main = avatarMain(avatar);
  return (
    <g>
      <ellipse cx="0" cy="2" rx="30" ry="6" fill="#171347" opacity="0.22" />
      <rect x="-15" y="-28" width="12" height="28" rx="5" fill="#2b2370" />
      <rect x="3" y="-28" width="12" height="28" rx="5" fill="#2b2370" />
      <ellipse cx="-9" cy="-1" rx="9" ry="5" fill="#171347" />
      <ellipse cx="9" cy="-1" rx="9" ry="5" fill="#171347" />
      <rect x="-28" y="-66" width="10" height="30" rx="5" fill={main} />
      <rect x="18" y="-66" width="10" height="30" rx="5" fill={main} />
      <rect x="-21" y="-70" width="42" height="46" rx="15" fill={main} />
      <rect x="-15" y="-62" width="30" height="28" rx="9" fill="#ffc933" />
      <svg x="-37" y="-132" width="74" height="74" viewBox="2 -12 96 110" overflow="visible"><AvatarArt a={avatar} /></svg>
    </g>
  );
}

export function StepScene({ position, max, label = 'Step', others = [], variant = 'hero', decorative = false, heroAvatar }: {
  position: number; max: number; label?: string; others?: Racer[]; variant?: 'hero' | 'banner' | 'compact'; decorative?: boolean; heroAvatar?: Avatar | null;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const n = Math.max(1, max);
  const at = clamp(position, 0, n);
  const scene = useRef<SVGGElement>(null);
  const hero = useRef<SVGGElement>(null);
  const prev = useRef(at);

  // The climb: re-draw at the new position, then play the camera move from where the old picture was. Transforms only.
  useEffect(() => {
    const d = at - prev.current; prev.current = at;
    if (!d || reduced()) return;
    scene.current?.animate?.([{ transform: `scale(${S ** clamp(d, -3, 3)})` }, { transform: 'scale(1)' }], { duration: 650, easing: 'cubic-bezier(0.34, 1.3, 0.64, 1)' });
    hero.current?.animate?.([{ transform: 'translateY(0)' }, { transform: `translateY(${d > 0 ? -22 : 8}px)` }, { transform: 'translateY(0)' }], { duration: 650, easing: 'ease-out' });
  }, [at]);

  const same = others.filter((o) => o.step === at);
  const ahead = others.filter((o) => o.step > at);
  const behind = others.filter((o) => o.step < at);
  const K = Math.min(AHEAD, n - at);

  const bands: React.ReactNode[] = [];
  for (let k = K; k >= -1; k--) { // far first, so nearer steps paint over them
    const num = at + k;
    const b = edge(k - 1), t = edge(k);
    const ym = mix(b.y, t.y, 0.58), hm = mix(b.hw, t.hw, 0.58);
    const [dark, light] = STEP_COLORS[((num % 5) + 5) % 5]!;
    const fs = (b.y - ym) * 0.62;
    const onDark = num % 5 !== 3;
    bands.push(
      <g key={num}>
        <polygon points={`${VX - b.hw},${b.y} ${VX + b.hw},${b.y} ${VX + hm},${ym} ${VX - hm},${ym}`} fill={dark} />
        <polygon points={`${VX - hm},${ym} ${VX + hm},${ym} ${VX + t.hw},${t.y} ${VX - t.hw},${t.y}`} fill={light} />
        <line x1={VX - hm} y1={ym} x2={VX + hm} y2={ym} stroke="#fff" strokeOpacity="0.55" strokeWidth={Math.max(0.6, 2.2 * S ** k)} />
        {k >= 1 && <text x={VX + hm * 0.55} y={(b.y + ym) / 2 + fs * 0.36} textAnchor="middle" fontSize={fs} fontWeight={800} fill={onDark ? '#fff' : '#171347'}>{num}</text>}
        {k === 1 && at < n && (
          <g transform={`translate(${VX - hm * 0.55} ${(b.y + ym) / 2})`} fill="#171347" opacity="0.8">
            <rect x={-fs * 0.36} y={-fs * 0.05} width={fs * 0.72} height={fs * 0.55} rx={fs * 0.1} />
            <path d={`M${-fs * 0.22} ${-fs * 0.05} v${-fs * 0.2} a${fs * 0.22} ${fs * 0.22} 0 0 1 ${fs * 0.44} 0 v${fs * 0.2}`} fill="none" stroke="#171347" strokeWidth={fs * 0.12} />
          </g>
        )}
        {k >= 1 && num % 2 === 0 && (() => {
          const side = num % 4 === 0 ? -1 : 1;
          const lx = VX + side * (b.hw + 24 * S ** k), ly = mix(b.y, t.y, 0.5) - 66 * S ** k;
          return <g><circle className="flame" cx={lx} cy={ly} r={22 * S ** k} fill="#ffc933" opacity="0.35" /><circle cx={lx} cy={ly} r={9 * S ** k} fill="#ffc933" /></g>;
        })()}
        {k >= 1 && ahead.filter((o) => o.step === num).slice(0, 3).map((o, i, list) => {
          const r = (b.y - t.y) * 0.3;
          return <Pawn key={o.id} who={o} r={r} x={VX - hm * 0.1 + (i - (list.length - 1) / 2) * r * 2.3} y={mix(ym, t.y, 0.55)} />;
        })}
        {k >= 1 && ahead.filter((o) => o.step === num).length > 3 && (
          <text x={VX + hm * 0.5} y={mix(ym, t.y, 0.55)} fontSize={(b.y - t.y) * 0.3} fontWeight={800} fill="#171347" textAnchor="middle">+{ahead.filter((o) => o.step === num).length - 3}</text>
        )}
        {k === K && num === n && (
          <g>
            <path d={`M${VX - t.hw * 0.55} ${t.y} v${-t.hw * 0.8} a${t.hw * 0.55} ${t.hw * 0.55} 0 0 1 ${t.hw * 1.1} 0 v${t.hw * 0.8}z`} fill="#c99700" />
            <path d={`M${VX - t.hw * 0.4} ${t.y} v${-t.hw * 0.8} a${t.hw * 0.4} ${t.hw * 0.4} 0 0 1 ${t.hw * 0.8} 0 v${t.hw * 0.8}z`} fill="#fff7d6" />
            <path d={`M${VX} ${t.y - t.hw * 1.05} l${t.hw * 0.09} ${t.hw * 0.2} l${t.hw * 0.22} ${t.hw * 0.03} l${-t.hw * 0.16} ${t.hw * 0.15} l${t.hw * 0.04} ${t.hw * 0.22} l${-t.hw * 0.19} ${-t.hw * 0.11} l${-t.hw * 0.19} ${t.hw * 0.11} l${t.hw * 0.04} ${-t.hw * 0.22} l${-t.hw * 0.16} ${-t.hw * 0.15} l${t.hw * 0.22} ${-t.hw * 0.03}z`} fill="#ffc933" />
          </g>
        )}
      </g>,
    );
  }

  const done = at >= n;
  const box = variant === 'compact' ? '0 190 400 210' : variant === 'banner' ? '0 130 400 270' : '0 10 400 390';
  const text = `${label} ${position} of ${n}`;
  return (
    <div role={decorative ? undefined : 'img'} aria-label={decorative ? undefined : text} aria-hidden={decorative || undefined} className="relative mx-auto w-full max-w-md overflow-hidden rounded-3xl border-2 border-line bg-surface">
      <svg viewBox={box} className="block h-auto w-full" aria-hidden focusable="false">
        <defs>
          <radialGradient id={`${uid}g`} cx="50%" cy="9%" r="75%"><stop offset="0" stopColor="#fff3b0" /><stop offset="0.35" stopColor="#e5dcff" /><stop offset="1" stopColor="#b7a6ff" /></radialGradient>
          <linearGradient id={`${uid}w`} x1="0" x2="1"><stop offset="0" stopColor="#3a1fb0" /><stop offset="1" stopColor="#6a4cff" /></linearGradient>
        </defs>
        <rect width="400" height="400" fill={`url(#${uid}g)`} />
        <polygon points={`0,0 ${VX},${VY} ${VX - HW - (400 - VY - A) * (HW / A)},400 0,400`} fill={`url(#${uid}w)`} />
        <polygon points={`400,0 ${VX},${VY} ${VX + HW + (400 - VY - A) * (HW / A)},400 400,400`} fill={`url(#${uid}w)`} opacity="0.85" />
        <g ref={scene} style={{ transformOrigin: `${VX}px ${VY}px` }}>{bands}</g>
        {same.slice(0, 3).map((o, i) => <Pawn key={o.id} who={o} r={13} x={VX + (i % 2 ? 1 : -1) * (46 + Math.floor(i / 2) * 30)} y={370} />)}
        <g transform={`translate(${VX} 388)`}><g ref={hero}>{heroAvatar ? <HeroAvatar avatar={heroAvatar} /> : <Hero />}</g></g>
        {done && (
          <g>
            {[[60, 110, '#ffc933'], [340, 90, '#ff6b6b'], [95, 200, '#38b6ff'], [310, 190, '#12b886'], [150, 70, '#ff6b6b'], [260, 60, '#ffc933']].map(([x, y, c], i) => (
              <rect key={i} className="confetti" x={x as number} y={y as number} width="10" height="10" rx="2" fill={c as string} style={{ animationDelay: `${i * 0.2}s` }} />
            ))}
          </g>
        )}
      </svg>
      <div aria-hidden className="absolute bottom-2 left-2 rounded-2xl bg-ink/75 px-3 py-1 text-white">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/80">{label}</p>
        <p className="font-display leading-none"><span className="text-3xl font-bold">{at}</span> <span className="text-sm font-semibold text-white/80">of {n}</span></p>
      </div>
      {(others.length > 0 || done) && (
        <div aria-hidden className="absolute right-2 top-2 flex flex-col items-end gap-1 text-xs font-bold">
          {done && <span className="rounded-full bg-sun px-3 py-1 text-ink">Top step reached!</span>}
          {ahead.length > 0 && <span className="rounded-full bg-white/90 px-2.5 py-1 text-ink">{ahead.length} ahead</span>}
          {behind.length > 0 && <span className="rounded-full bg-white/90 px-2.5 py-1 text-ink">{behind.length} behind</span>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- StepRace */

const SIZES = {
  strip: { cols: 16, base: 8, rise: 2.2, av: 18, gap: 14, stack: 3, pad: 10 },
  big: { cols: 24, base: 20, rise: 7, av: 30, gap: 26, stack: 7, pad: 14 },
} as const;

export function StepRace({ racers, max, meId, size = 'strip' }: { racers: Racer[]; max: number; meId?: string; size?: 'strip' | 'big' }) {
  const n = Math.max(1, max);
  const c = SIZES[size];
  const cols = Math.min(n, c.cols);
  const per = n / cols;
  const colOf = (s: number) => (s <= 0 ? 0 : Math.min(cols, Math.ceil(s / per)));
  const blockH = (i: number) => c.base + i * c.rise;
  const w = 100 / (cols + 1);

  const groups = new Map<number, Racer[]>();
  for (const r of racers) { const i = colOf(r.step); const g = groups.get(i) ?? []; g.push(r); groups.set(i, g); }
  const me = racers.find((r) => r.id === meId);
  // Only as tall as the tallest pile of players, so a quiet staircase does not leave a big empty box.
  let height = blockH(cols) + 26;
  for (const [i, list] of groups) height = Math.max(height, blockH(i) + 3 + (Math.min(list.length, c.stack) - 1) * c.gap + c.av + 4);
  height += c.pad / 2;
  const cells: React.ReactNode[] = [];
  for (const [i, list] of groups) {
    list.sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.id < b.id ? -1 : 1));
    const shown = list.length > c.stack ? c.stack - 1 : list.length;
    list.slice(0, shown).forEach((r, idx) => {
      const mine = r.id === meId;
      cells.push(
        <span key={r.id} title={r.nickname} className={`absolute grid place-items-center rounded-full bg-white shadow-md transition-[left,bottom] duration-700 ease-[cubic-bezier(0.34,1.3,0.64,1)] ${mine ? 'z-20 ring-2 ring-sun' : 'z-10'}`}
          style={{ left: `${(i + 0.5) * w}%`, bottom: blockH(i) + 3 + idx * c.gap, width: c.av, height: c.av, marginLeft: -c.av / 2 }}>
          <AvatarView avatar={lookOf(r)} size={c.av} />
        </span>,
      );
    });
    if (list.length > shown) {
      cells.push(
        <span key={`more${i}`} className="absolute z-10 grid place-items-center rounded-full bg-ink px-1 font-bold text-white transition-[left,bottom] duration-700"
          style={{ left: `${(i + 0.5) * w}%`, bottom: blockH(i) + 3 + shown * c.gap, minWidth: c.av, height: c.av, transform: 'translateX(-50%)', fontSize: c.av * 0.46 }}>+{list.length - shown}</span>,
      );
    }
  }

  const labelAt = (i: number) => (i === 0 ? 'Start' : String(Math.round(i * per)));
  const every = cols <= 12 ? 1 : cols <= 20 ? 2 : 3;
  const text = me ? `Step ${me.step} of ${n}. ${racers.length} players on the staircase.` : `${racers.length} player${racers.length === 1 ? '' : 's'} on the staircase, ${n} steps.`;
  return (
    <div role="img" aria-label={text} className="rounded-2xl bg-primary-soft/70 p-2">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-b from-[#f1edff] to-[#ded6ff]" style={{ height }} aria-hidden>
        {/* The staircase: one continuous run of steps, lighter on the tread (the part you stand on) and darker on the riser, climbing in one violet. */}
        <div className="absolute inset-x-0 bottom-0 flex items-end">
          {Array.from({ length: cols + 1 }, (_, i) => {
            const base = i === 0 ? ([228, 220, 255] as const) : mixRgb(RISER_LOW, RISER_HIGH, i / cols);
            const tread = i === 0 ? '#f6f2ff' : rgb(mixRgb(base, [255, 255, 255], 0.38));
            const tt = size === 'big' ? 9 : 5;
            return <div key={i} style={{ width: `${w}%`, height: blockH(i), background: `linear-gradient(to bottom, ${tread} 0 ${tt}px, ${rgb(base)} ${tt}px)` }} className="border-r border-white/30" />;
          })}
        </div>
        {/* handrail along the top of the steps */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" fill="none">
          <line x1={0.5 * w} y1={height - blockH(0) - (size === 'big' ? 22 : 12)} x2={(cols + 0.5) * w} y2={height - blockH(cols) - (size === 'big' ? 22 : 12)} stroke="#4527d6" strokeOpacity="0.55" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        </svg>
        {/* the goal door at the top */}
        <span className="absolute z-0 grid place-items-center rounded-t-full border-[3px] border-b-0 border-[#c99700] bg-[#fff3b0]" style={{ left: `${(cols + 0.5) * w}%`, bottom: blockH(cols), width: size === 'big' ? 30 : 16, height: size === 'big' ? 44 : 24, marginLeft: size === 'big' ? -15 : -8 }}>
          <svg viewBox="0 0 24 24" className={size === 'big' ? 'h-5 w-5' : 'h-3 w-3'} fill="#c99700"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17l-6.1 3.4 1.5-6.8L2.2 9l6.9-.7z" /></svg>
        </span>
        {cells}
      </div>
      <div aria-hidden className="mt-1 flex text-[10px] font-bold text-muted">
        {Array.from({ length: cols + 1 }, (_, i) => (
          <span key={i} style={{ width: `${w}%` }} className="overflow-visible whitespace-nowrap text-center">{i === 0 || i === cols || i % every === 0 ? labelAt(i) : ''}</span>
        ))}
      </div>
    </div>
  );
}
