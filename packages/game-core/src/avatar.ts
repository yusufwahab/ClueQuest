/** A player's customisable character: four small choices, so it is cheap to store, send and draw. */
export interface Avatar { color: number; face: number; hat: number; extra: number }
export const AVATAR_COUNTS = { color: 10, face: 8, hat: 8, extra: 6 } as const;

const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };

/** A friendly look picked from a seed (a nickname or id), so nobody is ever without one. */
export function defaultAvatar(seed: string): Avatar {
  const h = hash(seed || 'player');
  return { color: h % AVATAR_COUNTS.color, face: (h >>> 4) % AVATAR_COUNTS.face, hat: (h >>> 8) % 3 === 0 ? 0 : (h >>> 8) % AVATAR_COUNTS.hat, extra: (h >>> 12) % 4 === 0 ? 0 : (h >>> 12) % AVATAR_COUNTS.extra };
}

/** Accepts anything, returns a valid avatar or null. */
export function normaliseAvatar(a: unknown): Avatar | null {
  if (!a || typeof a !== 'object') return null;
  const o = a as Record<string, unknown>;
  const pick = (k: keyof Avatar) => { const v = o[k]; return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < AVATAR_COUNTS[k] ? v : null; };
  const color = pick('color'), face = pick('face'), hat = pick('hat'), extra = pick('extra');
  return color === null || face === null || hat === null || extra === null ? null : { color, face, hat, extra };
}

export const REACTIONS = ['clap', 'fire', 'laugh', 'wow', 'heart', 'party', 'rocket', 'thumbs'] as const;
export type Reaction = (typeof REACTIONS)[number];
