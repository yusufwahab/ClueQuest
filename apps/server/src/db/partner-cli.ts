import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../env';
import { migrate, openDb } from './db';
import { Mailer } from '../email';
import { QuizService } from '../quizzes';
import { PartnerService } from '../partners';

// Same rule as the server: use apps/server/.env if present, real environment variables win.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (process.env.CLUEQUEST_SKIP_ENV_FILE !== '1' && existsSync(envFile)) process.loadEnvFile(envFile);

// Flags:      npm run partner:create -- --slug msva --name "MS Virtual Academy" --webhook https://example.org/hooks/cluequest --return https://example.org
// Plain words: npm run partner:create -- msva MS Virtual Academy https://example.org/hooks/cluequest https://example.org
// (slug first, then the name, then the webhook URL and the return origin last). The plain form exists because some shells hand
// the --flags to npm instead of this script.
const args = process.argv.slice(2);
const get = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
let slug = get('slug'); let name = get('name'); let webhook = get('webhook'); let ret = get('return');
if (!slug && !name && !webhook && !ret && args.length >= 4 && !args.some((a) => a.startsWith('--'))) {
  slug = args[0]; name = args.slice(1, -2).join(' '); webhook = args.at(-2); ret = args.at(-1);
}
if (!slug || !name || !webhook || !ret) { console.error('Usage: partner:create --slug <id> --name <name> --webhook <url> --return <origin[,origin]>\n   or: partner:create <id> <name words...> <webhook-url> <return-origin>'); process.exit(1); }
if (!/^https?:\/\//.test(webhook) || !/^https?:\/\//.test(ret)) { console.error(`The webhook and return values must be full web addresses starting with https://. Got webhook="${webhook}" return="${ret}".`); process.exit(1); }
console.log(`Saving partner "${slug}" (${name})\n  results go to: ${webhook}\n  return allowed to: ${ret}\n`);

const env = loadEnv();
const db = await openDb(env);
await migrate(db, { dev: env.DB_DRIVER === 'pglite' });
const svc = new PartnerService(db, env, new QuizService(db, env, new Mailer(env)));
const k = await svc.create({ slug, name, webhookUrl: webhook, returnOrigins: ret.split(',').map((s) => s.trim()) });
console.log('Partner saved. These secrets are shown once:\n');
console.log(`  API key:         ${k.apiKey}`);
console.log(`  Webhook secret:  ${k.webhookSecret}`);
await db.close();
