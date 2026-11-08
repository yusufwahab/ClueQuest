/** When a quest may be taken. 'instant' = no schedule; 'manual' = the host starts it; 'auto' = it starts by itself at the set time. */
export type StartMode = 'instant' | 'manual' | 'auto';
export interface ScheduleSettings { startMode?: StartMode | null; startsAt?: string | null; startedAt?: string | null }

/** Players may enter a scheduled live lobby this long before the start time, to chat and pick a character. */
export const EARLY_JOIN_MS = 10 * 60_000;

export interface ScheduleState { mode: StartMode; startsAt: string | null; startedAt: string | null; open: boolean; joinOpen: boolean; due: boolean }

export function scheduleState(s: ScheduleSettings | null | undefined, now: number): ScheduleState {
  const mode: StartMode = s?.startMode === 'manual' || s?.startMode === 'auto' ? s.startMode : 'instant';
  const startsAt = mode === 'instant' ? null : s?.startsAt ?? null;
  const startedAt = s?.startedAt ?? null;
  const at = startsAt ? Date.parse(startsAt) : NaN;
  const due = mode !== 'instant' && Number.isFinite(at) && now >= at;
  // A solo link or live game is "open" once it has been started, or at the set time when it starts by itself.
  const open = mode === 'instant' || !!startedAt || (mode === 'auto' && due);
  const joinOpen = open || due || (Number.isFinite(at) && now >= at - EARLY_JOIN_MS);
  return { mode, startsAt, startedAt, open, joinOpen, due };
}
