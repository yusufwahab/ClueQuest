import { defineConfig, devices } from '@playwright/test';

// Three servers: ClueQuest API (in-memory DB, seeded demo teacher + test partner), the built web app, and the local test partner.
// Ports are overridable so a stale local server is never reused by accident. Build the web app first: npm run build -w @cluequest/web
const api = process.env.E2E_API_PORT ?? '8791';
const web = process.env.E2E_WEB_PORT ?? '4174';
const partner = process.env.E2E_PARTNER_PORT ?? '4601';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${web}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    {
      command: 'npx tsx apps/server/src/index.ts',
      env: {
        CLUEQUEST_SKIP_ENV_FILE: '1', NODE_ENV: 'development', DB_DRIVER: 'pglite', PORT: api, SEED_DEV_DATA: 'true', AI_MOCK: 'true', EMAIL_MODE: 'log',
        RATE_LIMIT_DISABLED: 'true', ANSWER_GRACE_MS: '300', WEBHOOK_BACKOFF_MS: '200', PUBLIC_WEB_URL: `http://localhost:${web}`,
        ALLOWED_ORIGINS: `http://localhost:${web}`, TEST_PARTNER_PORT: partner,
      },
      url: `http://localhost:${api}/healthz`, reuseExistingServer: false, timeout: 60_000,
    },
    { command: `npx vite preview --port ${web} --strictPort`, cwd: 'apps/web', env: { VITE_DEV_API_TARGET: `http://localhost:${api}` }, url: `http://localhost:${web}`, reuseExistingServer: false },
    {
      command: 'node tools/test-partner/server.mjs',
      env: { TEST_PARTNER_PORT: partner, CLUEQUEST_API_URL: `http://localhost:${api}`, FAIL_FIRST: '0' },
      url: `http://localhost:${partner}/results`, reuseExistingServer: false,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, grep: /@phone/ },
  ],
});
