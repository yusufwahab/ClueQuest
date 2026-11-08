import { z } from 'zod';
import { limits } from '@cluequest/config';

export const optionSchema = z.object({ id: z.string().min(1).max(40), text: z.string().trim().min(1).max(300) });
/** A picture shown with the question. The file lives on the server; the question only holds its id and a description for screen readers. */
// The id is either an id of ours (a UUID) or a Cloudinary public id. Letters, numbers, / _ and - only, so it can never alter the address it is placed in.
export const questionImageSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9/_-]{0,199}$/, 'Invalid picture'), alt: z.string().trim().max(200).default('') });
export const questionSchema = z.object({
  id: z.string().min(1).max(60),
  text: z.string().trim().min(1, 'Write the question').max(1000),
  options: z.array(optionSchema).min(limits.minOptions).max(limits.maxOptions),
  correctId: z.string().min(1),
  marks: z.number().min(0).max(limits.maxMarks).default(1),
  points: z.number().int().min(0).max(limits.maxPoints).default(100),
  explanation: z.string().max(1000).default(''),
  image: questionImageSchema.nullable().default(null),
});
export type Question = z.infer<typeof questionSchema>;

/** How the host wants the quest scored by default. Stored with the draft; each activity can still override it. */
export const playSchema = z.object({
  style: z.enum(['points', 'steps']).default('points'),
  wrong: z.enum(['stay', 'down']).default('stay'),
  passMarkPercent: z.number().min(0).max(100).nullable().default(null),
});
export type PlayDefaults = z.infer<typeof playSchema>;

/** Drafts may be incomplete; publishing runs validatePublishable(). */
export const draftSchema = z.object({
  title: z.string().trim().min(1, 'Give the quiz a title').max(120),
  subject: z.string().trim().max(60).default(''),
  instructions: z.string().max(2000).default(''),
  play: playSchema.optional(),
  questions: z.array(questionSchema.partial({ marks: true, points: true, explanation: true })).max(limits.maxQuestions).default([]),
});
export type DraftInput = z.input<typeof draftSchema>;

export function validatePublishable(d: { title: string; questions: Partial<Question>[] }): string[] {
  const errs: string[] = [];
  if (!d.title?.trim()) errs.push('Add a title.');
  if (d.questions.length === 0) errs.push('Add at least one question.');
  d.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.text?.trim()) errs.push(`Question ${n}: write the question.`);
    const opts = q.options ?? [];
    if (opts.length < limits.minOptions) errs.push(`Question ${n}: needs at least ${limits.minOptions} answer options.`);
    if (opts.some((o) => !o.text?.trim())) errs.push(`Question ${n}: every option needs text.`);
    const texts = opts.map((o) => o.text.trim().toLowerCase());
    if (new Set(texts).size !== texts.length) errs.push(`Question ${n}: options must be different.`);
    if (!opts.some((o) => o.id === q.correctId)) errs.push(`Question ${n}: choose the correct answer.`);
    if ((q.marks ?? 1) <= 0) errs.push(`Question ${n}: marks must be above zero.`);
  });
  return errs;
}

/** What the host fills in for the AI assistant. Kept small on purpose: one request builds a whole draft. */
export const aiGenerateSchema = z.object({
  topic: z.string().trim().min(3, 'Say what the quest is about').max(300),
  notes: z.string().trim().max(6000).default(''),
  count: z.number().int().min(1).max(20).default(8),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
  level: z.string().trim().max(60).default(''),
  language: z.string().trim().min(2).max(30).default('English'),
  optionCount: z.number().int().min(2).max(limits.maxOptions).default(4),
  explanations: z.boolean().default(false),
});
export type AiGenerateInput = z.input<typeof aiGenerateSchema>;

export const stepsSchema =z.object({ wrong: z.enum(['stay', 'down']).default('stay') });

const passMark = z.number().min(0).max(100).nullable().default(null);
export const activitySchema = z.object({
  quizId: z.string().uuid(),
  mode: z.enum(['solo', 'live', 'cbt']),
  style: z.enum(['points', 'steps']).default('points'),
  title: z.string().trim().max(120).optional(),
  steps: stepsSchema.default({ wrong: 'stay' }),
  passMarkPercent: passMark,
  /** Solo: show right/wrong after each answer (locks the answer). */
  instantFeedback: z.boolean().default(false),
  /** Live: seconds per question. */
  secondsPerQuestion: z.number().int().min(5).max(300).default(30),
  /** Solo/CBT: attempts allowed per identified learner (null = unlimited). */
  attemptLimit: z.number().int().min(1).max(20).nullable().default(null),
  /** CBT */
  opensAt: z.string().datetime().nullable().default(null),
  closesAt: z.string().datetime().nullable().default(null),
  durationMinutes: z.number().int().min(1).max(600).nullable().default(null),
  release: z.enum(['immediate', 'after_close', 'manual']).default('immediate'),
  /** CBT: who may sit it. 'link' = anyone with the exam link (they enter a name and an email or ID); 'invited' = only people the host invites by email. */
  access: z.enum(['invited', 'link']).default('invited'),
  /** What a learner may see once released. */
  showAnswers: z.boolean().default(true),
});
export type ActivityInput = z.input<typeof activitySchema>;

export const inviteSchema = z.object({ invitees: z.array(z.object({ name: z.string().trim().min(1).max(80), email: z.string().email() })).min(1).max(200) });

export const registerSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200), displayName: z.string().trim().min(1).max(60) });
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export const startAttemptSchema = z.object({ name: z.string().trim().max(60).optional(), candidateId: z.string().trim().max(100).optional() });
export const saveAnswersSchema = z.object({ answers: z.record(z.string(), z.string().nullable()) });
export const answerOneSchema = z.object({ questionId: z.string(), optionId: z.string() });

export const avatarSchema = z.object({ color: z.number().int().min(0).max(9), face: z.number().int().min(0).max(7), hat: z.number().int().min(0).max(7), extra: z.number().int().min(0).max(5) });
export const joinRoomSchema = z.object({ nickname: z.string().trim().min(2).max(20), resumeToken: z.string().optional(), avatar: avatarSchema.optional() });

/** ---- Partner contract (versioned under /api/partner/v1) ---- */
export const launchSchema = z.object({
  quizId: z.string().uuid(),
  assignmentRef: z.string().min(1).max(200),
  learnerRef: z.string().min(1).max(200),
  returnUrl: z.string().url(),
  learnerName: z.string().max(80).optional(),
  activity: z.object({
    type: z.enum(['solo', 'cbt']).default('solo'),
    style: z.enum(['points', 'steps']).default('points'),
    steps: stepsSchema.optional(),
    passMarkPercent: z.number().min(0).max(100).nullable().optional(),
    attemptLimit: z.number().int().min(1).max(20).nullable().optional(),
    durationMinutes: z.number().int().min(1).max(600).nullable().optional(),
    opensAt: z.string().datetime().nullable().optional(),
    closesAt: z.string().datetime().nullable().optional(),
    instantFeedback: z.boolean().optional(),
  }).default({ type: 'solo', style: 'points' }),
});

export interface ResultEvent {
  eventId: string;
  type: 'attempt.submitted';
  partnerAssignmentRef: string;
  learnerRef: string;
  attemptId: string;
  quizId: string;
  quizVersion: number;
  activityType: 'solo' | 'cbt';
  style: 'points' | 'steps';
  marksEarned: number;
  marksPossible: number;
  percent: number;
  passMarkPercent: number | null;
  passed: boolean | null;
  points?: number; pointsPossible?: number;
  stepPosition?: number; stepMax?: number;
  submittedAt: string;
  autoSubmitted: boolean;
}
