import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';

// Load apps/server/.env if present (real environment variables win). CLUEQUEST_SKIP_ENV_FILE=1 ignores it (automated tests).
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (process.env.CLUEQUEST_SKIP_ENV_FILE !== '1' && existsSync(envFile)) process.loadEnvFile(envFile);

const app = await createApp();
const port = await app.listen();
console.log(`ClueQuest server listening on :${port} (${app.env.NODE_ENV}, db=${app.db.kind}, email=${app.env.EMAIL_MODE})`);

let closing = false;
const shutdown = async (sig: string) => {
  if (closing) return;
  closing = true;
  console.log(`${sig} received: shutting down`);
  setTimeout(() => process.exit(1), 10_000).unref();
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
