import type { Request, RequestHandler } from 'express';
import type { Env } from './env';
import type { Db } from './db/db';
import type { Auth } from './auth';
import type { QuizService } from './quizzes';
import type { AttemptService } from './attempts';
import type { LiveService } from './live';
import type { PartnerService, WebhookWorker } from './partners';
import type { Mailer } from './email';
import type { AiService } from './ai';

export interface Ctx {
  env: Env; db: Db; auth: Auth; quizzes: QuizService; attempts: AttemptService; live: LiveService;
  partners: PartnerService; webhooks: WebhookWorker; mailer: Mailer; ai: AiService;
  limit: (name: string, max: number, windowMs: number, keyFn?: (req: Request) => string) => RequestHandler;
}
