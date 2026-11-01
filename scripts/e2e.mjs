// Builds the web app and runs the Playwright journeys. Usage: npm run test:e2e [-- playwright args]
import { spawnSync } from 'node:child_process';

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('npm', ['run', 'build', '-w', '@cluequest/web']);
run('npx', ['playwright', 'test', ...process.argv.slice(2)]);
