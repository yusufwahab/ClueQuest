import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../env';
import { migrate, openDb } from './db';

// Same rule as the server: use apps/server/.env if present, real environment variables win.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (process.env.CLUEQUEST_SKIP_ENV_FILE !== '1' && existsSync(envFile)) process.loadEnvFile(envFile);

const env = loadEnv();
console.log(`Migrating database: ${env.DB_DRIVER}${env.DB_DRIVER === 'pg' ? ` (${new URL(env.DATABASE_URL!).host})` : ' (local, not your real database)'}`);
const db = await openDb(env);
const applied = await migrate(db, { dev: env.DB_DRIVER === 'pglite' });
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Nothing to apply');
await db.close();
