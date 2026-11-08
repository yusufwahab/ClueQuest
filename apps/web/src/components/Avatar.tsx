import { AVATAR_COUNTS, defaultAvatar, normaliseAvatar, type Avatar } from '@cluequest/game-core';

/**
 * Player characters. A look is four small choices (colour, face, hat, extra), drawn as plain SVG so it is crisp at any size,
 * costs nothing to load and works the same in the lobby, on the staircase and in the standings.
 */
export type { Avatar };

const COLORS = [['#5b3df5', '#3a1fb0'], ['#ff6b6b', '#e04848'], ['#38b6ff', '#1b8fd6'], ['#12b886', '#0b8f66'], ['#ffc933', '#e0a800'], ['#f06595', '#d6336c'], ['#ff922b', '#e8700a'], ['#15aabf', '#0b7285'], ['#94d82d', '#66a80f'], ['#868e96', '#495057']] as const;
export const AVATAR_COLOR_NAMES = ['Violet', 'Coral', 'Sky', 'Mint', 'Sun', 'Pink', 'Orange', 'Teal', 'Lime', 'Slate'];
export const AVATAR_FACE_NAMES = ['Smile', 'Grin', 'Cool', 'Wink', 'Surprised', 'Silly', 'Sleepy', 'Starstruck'];
export const AVATAR_HAT_NAMES = ['No hat', 'Cap', 'Party hat', 'Crown', 'Beanie', 'Headband', 'Wizard hat', 'Graduation cap'];
export const AVATAR_EXTRA_NAMES = ['Nothing', 'Glasses', 'Blush', 'Moustache', 'Headphones', 'Freckles'];
const INK = '#171347';
export const avatarMain = (a: Avatar) => COLORS[a.color % COLORS.length]![0];

function Face({ n }: { n: number }) {
  const eye = (x: number) => <circle cx={x} cy="52" r="3.6" fill={INK} />;
  const smile = <path d="M39 62 q11 10 22 0" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />;
  switch (n) {
    case 1: return <g>{eye(40)}{eye(60)}<path d="M38 60 q12 18 24 0z" fill={INK} /><path d="M42 66 q8 5 16 0 q-8 -2 -16 0z" fill="#ff6b6b" /></g>;
    case 2: return <g><rect x="31" y="47" width="17" height="11" rx="4" fill={INK} /><rect x="52" y="47" width="17" height="11" rx="4" fill={INK} /><rect x="47" y="50" width="6" height="3" fill={INK} />{smile}</g>;
    case 3: return <g>{eye(40)}<path d="M54 52 q6 -5 12 0" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />{smile}</g>;
    case 4: return <g>{eye(40)}{eye(60)}<ellipse cx="50" cy="65" rx="5" ry="6.5" fill={INK} /></g>;
    case 5: return <g>{eye(40)}{eye(60)}<path d="M39 61 q11 9 22 0" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" /><path d="M48 66 q2 10 8 5 q1 -4 -1 -6z" fill="#ff6b6b" /></g>;
    case 6: return <g><path d="M35 52 q5 4 10 0 M55 52 q5 4 10 0" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" /><path d="M42 64 q8 4 16 0" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" /></g>;
    case 7: { const star = (x: number) => <path d={`M${x} 45 l2.2 4.6 5 .6 -3.7 3.4 1 5 -4.5 -2.5 -4.5 2.5 1 -5 -3.7 -3.4 5 -.6z`} fill="#ffc933" stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />; return <g>{star(38)}{star(62)}<path d="M40 63 q10 9 20 0" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" /></g>; }
    default: return <g>{eye(40)}{eye(60)}{smile}</g>;
  }
}

function Hat({ n }: { n: number }) {
  switch (n) {
    case 1: return <g><path d="M22 32 a28 24 0 0 1 56 0z" fill="#ff6b6b" /><rect x="20" y="30" width="62" height="6" rx="3" fill="#e04848" /><circle cx="50" cy="9" r="3.5" fill="#fff" /></g>;
    case 2: return <g><path d="M50 -4 L66 28 L34 28z" fill="#f06595" /><path d="M42 14 l16 0 M38 22 l24 0" stroke="#fff" strokeWidth="3" strokeLinecap="round" /><circle cx="50" cy="-4" r="4.5" fill="#ffc933" /></g>;
    case 3: return <g><path d="M26 30 L26 8 L38 18 L50 4 L62 18 L74 8 L74 30z" fill="#ffc933" stroke="#c99700" strokeWidth="2" strokeLinejoin="round" /><circle cx="50" cy="20" r="3.2" fill="#ff6b6b" /><circle cx="35" cy="22" r="2.4" fill="#38b6ff" /><circle cx="65" cy="22" r="2.4" fill="#12b886" /></g>;
    case 4: return <g><path d="M22 32 a28 26 0 0 1 56 0z" fill="#38b6ff" /><rect x="20" y="28" width="60" height="8" rx="4" fill="#1b8fd6" /><circle cx="50" cy="6" r="5" fill="#fff" /></g>;
    case 5: return <g><path d="M15 34 Q50 14 85 34" fill="none" stroke="#ff6b6b" strokeWidth="7" strokeLinecap="round" /><path d="M15 34 Q50 14 85 34" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="4 6" strokeLinecap="round" /></g>;
    case 6: return <g><path d="M50 -10 L74 30 L26 30z" fill="#7048e8" /><rect x="18" y="26" width="64" height="7" rx="3.5" fill="#5f3dc4" /><path d="M50 4 l2 4 4 .5 -3 3 .8 4 -3.8 -2 -3.8 2 .8 -4 -3 -3 4 -.5z" fill="#ffc933" /></g>;
    case 7: return <g><path d="M30 22 L50 12 L70 22 L50 32z" fill={INK} /><path d="M38 28 v8 q12 8 24 0 v-8" fill="#2b2370" /><path d="M66 24 v14" stroke="#ffc933" strokeWidth="2.4" /><circle cx="66" cy="40" r="3" fill="#ffc933" /></g>;
    default: return null;
  }
}

function Extra({ n }: { n: number }) {
  switch (n) {
    case 1: return <g fill="none" stroke={INK} strokeWidth="2.8"><circle cx="40" cy="52" r="9.5" /><circle cx="60" cy="52" r="9.5" /><path d="M49.5 52 h1" /></g>;
    case 2: return <g fill="#ff6b6b" opacity="0.45"><circle cx="30" cy="62" r="5.5" /><circle cx="70" cy="62" r="5.5" /></g>;
    case 3: return <path d="M36 62 q7 -6 14 0 q7 -6 14 0 q-7 8 -14 3 q-7 5 -14 -3z" fill="#3b2a20" />;
    case 4: return <g><path d="M13 54 a37 37 0 0 1 74 0" fill="none" stroke="#2b2370" strokeWidth="5" strokeLinecap="round" /><rect x="8" y="46" width="11" height="19" rx="5" fill="#ff6b6b" /><rect x="81" y="46" width="11" height="19" rx="5" fill="#ff6b6b" /></g>;
    case 5: return <g fill="#b0643c" opacity="0.7"><circle cx="34" cy="60" r="1.6" /><circle cx="39" cy="63" r="1.6" /><circle cx="31" cy="65" r="1.6" /><circle cx="66" cy="60" r="1.6" /><circle cx="61" cy="63" r="1.6" /><circle cx="69" cy="65" r="1.6" /></g>;
    default: return null;
  }
}

/** The drawing itself, on a 100 x 100 canvas. Used directly inside other SVGs (the staircase) and by <Avatar>. */
export function AvatarArt({ a }: { a: Avatar }) {
  const [main, shade] = COLORS[a.color % COLORS.length]!;
  return (
    <g>
      <circle cx="50" cy="54" r="38" fill={shade} />
      <circle cx="50" cy="52" r="38" fill={main} />
      <ellipse cx="50" cy="56" rx="29" ry="27" fill="#fff" opacity="0.92" />
      <Face n={a.face} />
      <Extra n={a.extra} />
      <Hat n={a.hat} />
    </g>
  );
}

export function AvatarView({ avatar, name, size = 40, ring = false, className = '' }: { avatar?: Avatar | null; name?: string; size?: number; ring?: boolean; className?: string }) {
  const a = normaliseAvatar(avatar) ?? defaultAvatar(name ?? '');
  return (
    <svg aria-hidden viewBox="2 -12 96 110" width={size} height={size} className={`shrink-0 overflow-visible ${ring ? 'rounded-full ring-2 ring-sun ring-offset-2' : ''} ${className}`} focusable="false">
      <AvatarArt a={a} />
    </svg>
  );
}

const STORE = 'cq.avatar';
export function loadAvatar(seed = ''): Avatar {
  try { const a = normaliseAvatar(JSON.parse(localStorage.getItem(STORE) ?? 'null')); if (a) return a; } catch { /* fall through */ }
  return defaultAvatar(seed || String(Math.random()));
}
export function saveAvatar(a: Avatar) { try { localStorage.setItem(STORE, JSON.stringify(a)); } catch { /* private mode: not saved, still works */ } }
export const randomAvatar = (): Avatar => ({
  color: Math.floor(Math.random() * AVATAR_COUNTS.color), face: Math.floor(Math.random() * AVATAR_COUNTS.face),
  hat: Math.floor(Math.random() * AVATAR_COUNTS.hat), extra: Math.floor(Math.random() * AVATAR_COUNTS.extra),
});

function Choices({ label, names, count, value, make, onPick }: { label: string; names: readonly string[]; count: number; value: number; make: (i: number) => Avatar; onPick: (i: number) => void }) {
  return (
    <fieldset className="min-w-0">
      <legend className="label mb-1.5">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {Array.from({ length: count }, (_, i) => (
          <button key={i} type="button" role="radio" aria-checked={value === i} aria-label={names[i]} title={names[i]} onClick={() => onPick(i)}
            className={`grid place-items-center rounded-2xl border-2 p-1.5 transition ${value === i ? 'border-primary bg-primary-soft' : 'border-line bg-white hover:border-primary/50'}`}>
            <AvatarView avatar={make(i)} size={44} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Design-your-own-character panel: a big live preview, a shuffle button and one row of choices per part. */
export function AvatarEditor({ value, onChange }: { value: Avatar; onChange: (a: Avatar) => void }) {
  const set = (k: keyof Avatar) => (i: number) => onChange({ ...value, [k]: i });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-primary-soft to-white p-3 ring-1 ring-line">
        <AvatarView avatar={value} size={92} className="animate-pop" />
        <div className="min-w-0 flex-1">
          <p className="font-brand text-lg font-extrabold leading-tight">Your character</p>
          <p className="hint">Pick a colour, a face and a hat, or shuffle for a surprise.</p>
          <button type="button" className="btn btn-secondary mt-2 min-h-10! px-4! text-base!" onClick={() => onChange(randomAvatar())}>🎲 Shuffle</button>
        </div>
      </div>
      <fieldset className="min-w-0">
        <legend className="label mb-1.5">Colour</legend>
        <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-2">
          {COLORS.map(([main], i) => (
            <button key={i} type="button" role="radio" aria-checked={value.color === i} aria-label={AVATAR_COLOR_NAMES[i]} title={AVATAR_COLOR_NAMES[i]} onClick={() => set('color')(i)}
              className={`h-10 w-10 rounded-full border-4 transition ${value.color === i ? 'scale-110 border-ink' : 'border-white ring-1 ring-line'}`} style={{ background: main }} />
          ))}
        </div>
      </fieldset>
      <Choices label="Face" names={AVATAR_FACE_NAMES} count={AVATAR_COUNTS.face} value={value.face} make={(i) => ({ ...value, face: i })} onPick={set('face')} />
      <Choices label="Hat" names={AVATAR_HAT_NAMES} count={AVATAR_COUNTS.hat} value={value.hat} make={(i) => ({ ...value, hat: i })} onPick={set('hat')} />
      <Choices label="Extras" names={AVATAR_EXTRA_NAMES} count={AVATAR_COUNTS.extra} value={value.extra} make={(i) => ({ ...value, extra: i })} onPick={set('extra')} />
    </div>
  );
}
