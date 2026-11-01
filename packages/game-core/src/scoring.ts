/** Pure grading rules. Academic marks, game points and step position are three separate numbers. */
export interface GradedQuestion { id: string; correctId: string; marks: number; points: number }
export type Style = 'points' | 'steps';
export type WrongBehaviour = 'stay' | 'down';
export interface StepsConfig { wrong: WrongBehaviour }
export type Answers = Record<string, string | null | undefined>;

export interface QuestionOutcome { id: string; chosen: string | null; correct: boolean; marks: number; points: number; stepFrom: number; stepTo: number }
export interface GradeResult {
  marksEarned: number; marksPossible: number; percent: number;
  points: number; pointsPossible: number; stepPosition: number; stepMax: number;
  correctCount: number; outcomes: QuestionOutcome[];
}

/** Step rules: start 0, correct = +1, wrong/unanswered = stay or -1 (never below 0). */
export function nextStep(pos: number, correct: boolean, wrong: WrongBehaviour): number {
  if (correct) return pos + 1;
  return wrong === 'down' ? Math.max(0, pos - 1) : pos;
}

/** Grade a full attempt in question order. Same questions, any style; the style only chooses what is shown as "game score". */
export function gradeAttempt(questions: readonly GradedQuestion[], answers: Answers, steps: StepsConfig = { wrong: 'stay' }): GradeResult {
  let marksEarned = 0; let marksPossible = 0; let points = 0; let pointsPossible = 0; let pos = 0; let correctCount = 0;
  const outcomes: QuestionOutcome[] = [];
  for (const q of questions) {
    const chosen = answers[q.id] ?? null;
    const correct = chosen !== null && chosen === q.correctId;
    marksPossible += q.marks; pointsPossible += q.points;
    if (correct) { marksEarned += q.marks; points += q.points; correctCount++; }
    const to = nextStep(pos, correct, steps.wrong);
    outcomes.push({ id: q.id, chosen, correct, marks: correct ? q.marks : 0, points: correct ? q.points : 0, stepFrom: pos, stepTo: to });
    pos = to;
  }
  const percent = marksPossible > 0 ? Math.round((marksEarned / marksPossible) * 1000) / 10 : 0;
  return { marksEarned, marksPossible, percent, points, pointsPossible, stepPosition: pos, stepMax: questions.length, correctCount, outcomes };
}

/** Passing depends on the academic mark only, never on points or steps. */
export function hasPassed(percent: number, passMarkPercent: number | null | undefined): boolean | null {
  if (passMarkPercent == null) return null;
  return percent + 1e-9 >= passMarkPercent;
}

export interface Standing { id: string; points: number; step: number; marks: number }
/** Live standings: rank by the chosen style's game score, ties share rank (1,1,3); marks are shown separately. */
export function rankStandings<T extends Standing>(rows: T[], style: Style): (T & { rank: number })[] {
  const key = (r: Standing) => (style === 'steps' ? r.step : r.points);
  const sorted = [...rows].sort((a, b) => key(b) - key(a) || b.marks - a.marks);
  const out: (T & { rank: number })[] = [];
  sorted.forEach((r, i) => {
    const prev = out[i - 1];
    out.push({ ...r, rank: prev && key(prev) === key(r) && prev.marks === r.marks ? prev.rank : i + 1 });
  });
  return out;
}
