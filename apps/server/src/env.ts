import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const list = z.string().transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

/** Every server setting, validated at boot. Mirrored in apps/server/.env.example. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(8790),
  PUBLIC_WEB_URL: z.string().default('http://localhost:5174').transform((v) => (v.split(/[,\s]+/).find(Boolean) ?? '').replace(/\/+$/, '')).pipe(z.string().url()),
  ALLOWED_ORIGINS: list.default(() => ['http://localhost:5174']),
  DB_DRIVER: z.enum(['pglite', 'pg']).default('pglite'),
  DATABASE_URL: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).default(5),
  PGLITE_DIR: z.string().optional(),
  /** Signs teacher session tokens. Required (32+ chars) in production. */
  AUTH_SECRET: z.string().min(16).default('dev-only-cluequest-secret-change-me-0123'),
  /** Allow teachers to self-register. Turn off in production if accounts are provisioned by an admin. */
  ALLOW_REGISTRATION: bool.default(true),
  REDIS_URL: z.string().optional(),
  EMAIL_MODE: z.enum(['log', 'brevo']).default('log'),
  BREVO_API_KEY: z.string().optional(),
  BREVO_SENDER_EMAIL: z.string().email().optional(),
  BREVO_SENDER_NAME: z.string().default('ClueQuest'),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(2).max(150).default(150),
  ANSWER_GRACE_MS: z.coerce.number().int().min(0).max(3000).default(750),
  /** Minutes a partner launch link stays valid. */
  LAUNCH_TTL_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
  /** Webhook retry backoff base (ms); delay = base * 2^tries. Tests shrink it. */
  WEBHOOK_BACKOFF_MS: z.coerce.number().int().min(10).default(30_000),
  WEBHOOK_MAX_TRIES: z.coerce.number().int().min(1).max(20).default(8),
  /** Folder with the built website (apps/web/dist). Default: next to the server. When it has an index.html the server serves the site too. */
  WEB_DIST: z.string().optional(),
  /** AI assistant (free tiers). Providers are tried in order, so a busy one falls through to the next. Neither key set = assistant off. */
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  /** Generations a host may run per day (protects the free limits). */
  AI_DAILY_LIMIT: z.coerce.number().int().min(1).max(500).default(20),
  /** Deterministic fake provider for tests and offline demos. */
  AI_MOCK: bool.default(false),
  /** Seed a local test partner + demo teacher (development only). */
  SEED_DEV_DATA: bool.default(false),
  RATE_LIMIT_DISABLED: bool.default(false),
});
export type Env = z.infer<typeof envSchema>;

export function loadEnv(rawIn: Record<string, string | undefined> = process.env): Env {
  const raw = Object.fromEntries(Object.entries(rawIn).filter(([, v]) => v !== undefined && v.trim() !== ''));
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const env = parsed.data;
  const p: string[] = [];
  if (env.NODE_ENV === 'production') {
    if (env.DB_DRIVER !== 'pg') p.push('DB_DRIVER must be "pg" in production');
    if (!raw.AUTH_SECRET || raw.AUTH_SECRET.length < 32) p.push('AUTH_SECRET (32+ random characters) is required in production');
    if (env.SEED_DEV_DATA) p.push('SEED_DEV_DATA must be false in production');
    if (env.RATE_LIMIT_DISABLED) p.push('RATE_LIMIT_DISABLED must be false in production');
    if (env.ALLOWED_ORIGINS.includes('*')) p.push('ALLOWED_ORIGINS must be an explicit allowlist');
  }
  if (env.DB_DRIVER === 'pg' && !env.DATABASE_URL) p.push('DATABASE_URL is required when DB_DRIVER=pg');
  if (env.EMAIL_MODE === 'brevo' && (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL)) p.push('BREVO_API_KEY and BREVO_SENDER_EMAIL are required when EMAIL_MODE=brevo');
  if (p.length) throw new Error(`Invalid environment: ${p.join('; ')}`);
  return env;
}
