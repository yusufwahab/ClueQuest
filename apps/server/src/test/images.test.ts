import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cloudinaryConfig, sniffImage } from '../images';
import { loadEnv } from '../env';
import { api, boot, sampleQuiz, teacher, type Harness } from './helpers';

// A PNG header (enough for type detection) and a GIF header.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('test image data')]);
const GIF = Buffer.from('R0lGODlhAQABAAAAACw=', 'base64');
const upload = (h: Harness, token: string | null, body: Buffer, type: string) =>
  fetch(`${h.base}/api/images`, { method: 'POST', headers: { 'content-type': type, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body });

describe('question pictures stored in the database (no Cloudinary account configured)', () => {
  let h: Harness;
  let tk: string;
  beforeAll(async () => { h = await boot(); tk = await teacher(h); });
  afterAll(async () => { await h.close(); });

  it('recognises real image types by their bytes', () => {
    expect(sniffImage(PNG)).toBe('image/png');
    expect(sniffImage(GIF)).toBe('image/gif');
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('image/webp');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull(); // SVG can carry scripts
    expect(sniffImage(Buffer.from('MZ not an image'))).toBeNull();
  });

  it('lets a host upload, serves it publicly with long cache headers, and stores the same picture once', async () => {
    const r = await upload(h, tk, PNG, 'image/png');
    expect(r.status).toBe(201);
    const { id, url } = await r.json() as { id: string; url: string };
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(url).toBe(`/api/images/${id}`);

    const again = await (await upload(h, tk, PNG, 'image/png')).json() as { id: string };
    expect(again.id).toBe(id); // deduplicated

    const got = await fetch(`${h.base}${url}`); // no sign-in: learners must be able to see it
    expect(got.status).toBe(200);
    expect(got.headers.get('content-type')).toBe('image/png');
    expect(got.headers.get('cache-control')).toContain('immutable');
    expect(got.headers.get('x-content-type-options')).toBe('nosniff');
    expect(got.headers.get('cross-origin-resource-policy')).toBe('cross-origin'); // the website can be on another address
    expect(Buffer.from(await got.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it('refuses uploads from guests, files that are not images, wrong labels and oversize files', async () => {
    expect((await upload(h, null, PNG, 'image/png')).status).toBe(401);
    expect((await upload(h, tk, Buffer.from('<svg></svg>'), 'image/png')).status).toBe(415); // labelled PNG, but the bytes say otherwise
    expect((await upload(h, tk, Buffer.from('<svg></svg>'), 'image/svg+xml')).status).toBe(415);
    expect((await upload(h, tk, Buffer.concat([PNG, Buffer.alloc(450 * 1024)]), 'image/png')).status).toBe(413);
    expect((await fetch(`${h.base}/api/images/not-an-id`)).status).toBe(404);
    expect((await fetch(`${h.base}/api/images/00000000-0000-0000-0000-000000000000`)).status).toBe(404);
  });

  it('keeps a question picture through save, publish and the learner view', async () => {
    const { id: imageId } = await (await upload(h, tk, PNG, 'image/png')).json() as { id: string };
    const quiz = { ...sampleQuiz, questions: sampleQuiz.questions.map((q, i) => (i === 0 ? { ...q, text: 'What is $x^2$ when $x=3$?', image: { id: imageId, alt: 'A graph' } } : q)) };
    const saved = await api(h, 'POST', '/quizzes', { token: tk, body: quiz });
    expect(saved.body.questions[0].image).toEqual({ id: imageId, alt: 'A graph', url: `/api/images/${imageId}` });
    expect(saved.body.questions[1].image).toBeNull();
    expect((await api(h, 'POST', `/quizzes/${saved.body.id}/publish`, { token: tk })).status).toBe(200);

    const act = await api(h, 'POST', '/activities', { token: tk, body: { quizId: saved.body.id, mode: 'solo', style: 'points' } });
    const start = await api(h, 'POST', `/public/solo/${act.body.shareCode}/start`, { body: {} });
    const view = await api(h, 'GET', '/attempts/me', { attempt: start.body.token });
    expect(view.body.questions[0].image).toEqual({ id: imageId, alt: 'A graph', url: `/api/images/${imageId}` });
    expect(view.body.questions[0].text).toBe('What is $x^2$ when $x=3$?'); // maths stays as written; the browser draws it
  });

  it('refuses a picture id that could change the address it is put in', async () => {
    for (const id of ['../secret', 'a?b=c', 'a,b', 'x y', '/abs', 'a.b']) {
      const q = { ...sampleQuiz.questions[0], image: { id, alt: '' } };
      expect((await api(h, 'POST', '/quizzes', { token: tk, body: { ...sampleQuiz, questions: [q] } })).status).toBe(400);
    }
  });
});

describe('question pictures stored on Cloudinary', () => {
  const SECRET = 'sec-456-very-secret';
  let fake: Server;
  let h: Harness;
  let tk: string;
  const hits: { path: string; fields: Record<string, string>; file: { size: number; type: string } | null }[] = [];
  let respond: { status: number; body: unknown } | null = null;

  beforeAll(async () => {
    // A stand-in for api.cloudinary.com: records what it was sent and answers like Cloudinary does.
    fake = createServer(async (req, res) => {
      const form = await new Request('http://fake.test', { method: 'POST', headers: req.headers as Record<string, string>, body: Readable.toWeb(req) as ReadableStream, duplex: 'half' } as RequestInit).formData();
      const fields: Record<string, string> = {}; let file: { size: number; type: string } | null = null;
      for (const [k, v] of form.entries()) { if (typeof v === 'string') fields[k] = v; else file = { size: v.size, type: v.type }; }
      hits.push({ path: req.url ?? '', fields, file });
      const out = respond ?? { status: 200, body: { public_id: fields.public_id, secure_url: 'https://ignored.example/x' } };
      res.writeHead(out.status, { 'content-type': 'application/json' }).end(JSON.stringify(out.body));
    });
    await new Promise<void>((ok) => fake.listen(0, ok));
    const port = (fake.address() as { port: number }).port;
    h = await boot({ CLOUDINARY_URL: `cloudinary://key123:${SECRET}@democloud`, CLOUDINARY_API_BASE: `http://localhost:${port}` });
    tk = await teacher(h);
  });
  afterAll(async () => { await h.close(); await new Promise((ok) => fake.close(ok)); });

  it('uploads with a correct signature, never sends the secret, and returns a CDN address', async () => {
    const r = await upload(h, tk, PNG, 'image/png');
    expect(r.status).toBe(201);
    const { id, url } = await r.json() as { id: string; url: string };

    const hash = createHash('sha256').update(PNG).digest('hex').slice(0, 32);
    expect(id).toBe(`cluequest/${hash}`);
    expect(url).toBe(`https://res.cloudinary.com/democloud/image/upload/f_auto,q_auto,c_limit,w_1200/${id}`);

    expect(hits).toHaveLength(1);
    const hit = hits[0]!;
    expect(hit.path).toBe('/v1_1/democloud/image/upload');
    expect(hit.fields.api_key).toBe('key123');
    expect(JSON.stringify(hit.fields)).not.toContain(SECRET); // only the signature goes over the wire
    const expected = createHash('sha1').update(`allowed_formats=png,jpg,webp,gif&overwrite=false&public_id=${id}&timestamp=${hit.fields.timestamp}${SECRET}`).digest('hex');
    expect(hit.fields.signature).toBe(expected);
    expect(hit.file).toEqual({ size: PNG.length, type: 'image/png' });
  });

  it('does not upload the same picture twice', async () => {
    const before = hits.length;
    const again = await (await upload(h, tk, PNG, 'image/png')).json() as { id: string };
    expect(again.id).toMatch(/^cluequest\//);
    expect(hits.length).toBe(before);
  });

  it('carries the CDN address on every question sent to a screen', async () => {
    const { id } = await (await upload(h, tk, PNG, 'image/png')).json() as { id: string };
    const quiz = { ...sampleQuiz, questions: sampleQuiz.questions.map((q, i) => (i === 0 ? { ...q, image: { id, alt: 'Diagram' } } : q)) };
    const saved = await api(h, 'POST', '/quizzes', { token: tk, body: quiz });
    const want = { id, alt: 'Diagram', url: `https://res.cloudinary.com/democloud/image/upload/f_auto,q_auto,c_limit,w_1200/${id}` };
    expect(saved.body.questions[0].image).toEqual(want);
    expect((await api(h, 'POST', `/quizzes/${saved.body.id}/publish`, { token: tk })).status).toBe(200);
    const act = await api(h, 'POST', '/activities', { token: tk, body: { quizId: saved.body.id, mode: 'solo', style: 'points' } });
    const start = await api(h, 'POST', `/public/solo/${act.body.shareCode}/start`, { body: {} });
    expect((await api(h, 'GET', '/attempts/me', { attempt: start.body.token })).body.questions[0].image).toEqual(want);
  });

  it('reports a storage failure plainly, without leaking details or the secret', async () => {
    respond = { status: 401, body: { error: { message: `Invalid Signature (${SECRET})` } } };
    try {
      const r = await upload(h, tk, Buffer.concat([PNG, Buffer.from('different picture')]), 'image/png');
      expect(r.status).toBe(502);
      const text = await r.text();
      expect(text).toContain('image_store');
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('Invalid Signature');
    } finally { respond = null; }
  });
});

describe('Cloudinary settings', () => {
  it('accepts one CLOUDINARY_URL or three separate values, and rejects half-set or malformed ones', () => {
    const base = { NODE_ENV: 'test' };
    expect(cloudinaryConfig(loadEnv({ ...base }))).toBeNull();
    expect(cloudinaryConfig(loadEnv({ ...base, CLOUDINARY_URL: 'cloudinary://k:s@mycloud' }))).toMatchObject({ cloud: 'mycloud', key: 'k', secret: 's', folder: 'cluequest' });
    expect(cloudinaryConfig(loadEnv({ ...base, CLOUDINARY_CLOUD_NAME: 'c', CLOUDINARY_API_KEY: 'k', CLOUDINARY_API_SECRET: 's' }))).toMatchObject({ cloud: 'c' });
    expect(() => loadEnv({ ...base, CLOUDINARY_CLOUD_NAME: 'c' })).toThrow(/CLOUDINARY/);
    expect(() => loadEnv({ ...base, CLOUDINARY_URL: 'https://not-cloudinary.example' })).toThrow(/CLOUDINARY_URL/);
    expect(() => loadEnv({ ...base, CLOUDINARY_URL: 'cloudinary://onlykey@mycloud' })).toThrow(/CLOUDINARY_URL/);
  });
});
