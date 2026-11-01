import { describe, expect, it } from 'vitest';
import { gradeAttempt, hasPassed, nextStep, rankStandings } from './scoring';

const qs = [
  { id: 'a', correctId: '1', marks: 2, points: 100 },
  { id: 'b', correctId: '2', marks: 3, points: 50 },
  { id: 'c', correctId: '1', marks: 5, points: 200 },
  { id: 'd', correctId: '3', marks: 1, points: 10 },
];
describe('gradeAttempt', () => {
  it('keeps marks, points and steps separate', () => {
    const r = gradeAttempt(qs, { a: '1', b: '9', c: '1' });
    expect(r.marksEarned).toBe(7); expect(r.marksPossible).toBe(11);
    expect(r.points).toBe(300); expect(r.stepPosition).toBe(2);
  });
  it('wrong and unanswered earn zero points', () => {
    const r = gradeAttempt(qs, {});
    expect(r.points).toBe(0); expect(r.marksEarned).toBe(0); expect(r.stepPosition).toBe(0);
  });
  it('steps: stay vs down, never below zero', () => {
    expect(gradeAttempt(qs, { a: '1', b: '1', c: '9', d: '9' }, { wrong: 'stay' }).stepPosition).toBe(1);
    expect(gradeAttempt(qs, { a: '1', b: '1', c: '9', d: '9' }, { wrong: 'down' }).stepPosition).toBe(0);
    expect(nextStep(0, false, 'down')).toBe(0);
  });
  it('same questions give the same marks under either steps rule', () => {
    const a = { a: '1', c: '1' };
    expect(gradeAttempt(qs, a, { wrong: 'stay' }).marksEarned).toBe(gradeAttempt(qs, a, { wrong: 'down' }).marksEarned);
  });
});
describe('pass', () => {
  it('depends on percent only', () => {
    expect(hasPassed(50, 50)).toBe(true); expect(hasPassed(49.9, 50)).toBe(false); expect(hasPassed(10, null)).toBeNull();
  });
});
describe('rankStandings', () => {
  it('ties share rank', () => {
    const r = rankStandings([{ id: 'x', points: 5, step: 1, marks: 1 }, { id: 'y', points: 5, step: 1, marks: 1 }, { id: 'z', points: 1, step: 0, marks: 0 }], 'points');
    expect(r.map((x) => x.rank)).toEqual([1, 1, 3]);
  });
});
