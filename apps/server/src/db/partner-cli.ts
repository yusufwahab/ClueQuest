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

// npm run partner:create -- --slug msva --name "MS Virtual Academy" --webhook https://example.org/hooks/cluequest --return https://example.org
const args = process.argv.slice(2);
const get = (k: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : undefined; };
const slug = get('slug'); const name = get('name'); const webhook = get('webhook'); const ret = get('return');
if (!slug || !name || !webhook || !ret) { console.error('Usage: partner:create --slug <id> --name <name> --webhook <url> --return <origin[,origin]>'); process.exit(1); }

const env = loadEnv();
const db = await openDb(env);
await migrate(db, { dev: env.DB_DRIVER === 'pglite' });
const svc = new PartnerService(db, env, new QuizService(db, env, new Mailer(env)));
const k = await svc.create({ slug, name, webhookUrl: webhook, returnOrigins: ret.split(',').map((s) => s.trim()) });
console.log('Partner saved. These secrets are shown once:\n');
console.log(`  API key:         ${k.apiKey}`);
console.log(`  Webhook secret:  ${k.webhookSecret}`);
await db.close();
