import { describe, expect, it } from 'vitest';
import { EARLY_JOIN_MS, scheduleState } from './schedule';

const at = '2030-01-01T10:00:00.000Z';
const t = Date.parse(at);

describe('scheduleState', () => {
  it('instant (or nothing set) is always open', () => {
    expect(scheduleState({}, 0)).toMatchObject({ mode: 'instant', open: true, joinOpen: true, startsAt: null });
    expect(scheduleState({ startMode: 'instant', startsAt: at }, 0)).toMatchObject({ open: true, startsAt: null });
  });
  it('automatic opens by itself at the time, not before', () => {
    const s = { startMode: 'auto' as const, startsAt: at };
    expect(scheduleState(s, t - 1).open).toBe(false);
    expect(scheduleState(s, t).open).toBe(true);
  });
  it('manual stays closed after the time until the host starts it', () => {
    const s = { startMode: 'manual' as const, startsAt: at };
    expect(scheduleState(s, t + 3600_000)).toMatchObject({ open: false, due: true });
    expect(scheduleState({ ...s, startedAt: at }, t + 3600_000).open).toBe(true);
  });
  it('lets players into a lobby a little early', () => {
    const s = { startMode: 'manual' as const, startsAt: at };
    expect(scheduleState(s, t - EARLY_JOIN_MS - 1).joinOpen).toBe(false);
    expect(scheduleState(s, t - EARLY_JOIN_MS).joinOpen).toBe(true);
  });
});
