import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, type Harness } from './helpers';

let h: Harness;
let dir: string;
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cq-web-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>ClueQuest</title><div id="root"></div>');
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
  writeFileSync(join(dir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  h = await boot({ WEB_DIST: dir });
});
afterAll(async () => { await h.close(); rmSync(dir, { recursive: true, force: true }); });

const get = (path: string) => fetch(`${h.base}${path}`);

describe('serving the website', () => {
  it('serves the home page and lets the browser router handle deep links', async () => {
    for (const p of ['/', '/sign-in', '/quizzes/new', '/q/ABC123', '/join/123456', '/launch/some-token']) {
      const r = await get(p);
      expect(r.status, p).toBe(200);
      expect(r.headers.get('content-type'), p).toContain('text/html');
      expect(await r.text(), p).toContain('id="root"');
    }
  });

  it('serves built files with long caching, and a missing asset is a 404 and not a page', async () => {
    const js = await get('/assets/app-abc123.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect((await get('/assets/missing.js')).status).toBe(404);
    expect((await get('/favicon.svg')).status).toBe(200);
  });

  it('keeps the API, health checks and strict headers intact', async () => {
    const nope = await get('/api/does-not-exist');
    expect(nope.status).toBe(404);
    expect(((await nope.json()) as { code: string }).code).toBe('not_found');
    expect((await (await get('/healthz')).json())).toEqual({ ok: true });
    expect(nope.headers.get('content-security-policy')).toContain("default-src 'none'"); // API: strictest policy
    const page = await get('/');
    expect(/script-src ([^;]*)/.exec(page.headers.get('content-security-policy') ?? '')?.[1]).toBe("'self'"); // website: own scripts only, never inline
  });
});
