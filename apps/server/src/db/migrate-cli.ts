import { loadEnv } from '../env';
import { migrate, openDb } from './db';

const env = loadEnv();
const db = await openDb(env);
const applied = await migrate(db, { dev: env.DB_DRIVER === 'pglite' });
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Nothing to apply');
await db.close();
