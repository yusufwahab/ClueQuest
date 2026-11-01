// Local stand-in for a learning platform (e.g. MSVA). Zero dependencies. It plays the partner's role end to end:
//   GET  /                    a page that starts an assignment launch
//   GET  /launch?quizId=...   server-side call to ClueQuest, then redirect the "student" to the returned link
//   GET  /class               the approved return destination
//   POST /webhooks/cluequest  verifies the signature, de-duplicates by event id, records the result
//   GET  /results             what this partner has received (JSON)
//   POST /reset               clears recorded results; POST /fail?n=3 makes the next n deliveries return 500
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.TEST_PARTNER_PORT ?? 4600);
const CLUEQUEST = (process.env.CLUEQUEST_API_URL ?? 'http://localhost:8790').replace(/\/$/, '');
const API_KEY = process.env.CLUEQUEST_API_KEY ?? 'cq_test_key_local_only';
const SECRET = process.env.CLUEQUEST_WEBHOOK_SECRET ?? 'whsec_test_local_only';

const events = new Map(); // eventId -> payload (the dedupe store)
const deliveries = []; // every delivery attempt received, including duplicates and failures
let failNext = Number(process.env.FAIL_FIRST ?? 0);

const html = (body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test partner</title>
<body style="font-family:system-ui;max-width:640px;margin:2rem auto;padding:0 1rem">${body}</body>`;
const send = (res, code, body, type = 'text/html') => { res.writeHead(code, { 'content-type': type }); res.end(body); };
const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

function verify(headers, body) {
  const ts = headers['x-cluequest-timestamp']; const sig = String(headers['x-cluequest-signature'] ?? '');
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expect = `v1=${createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')}`;
  const a = Buffer.from(sig); const b = Buffer.from(expect);
  return a.length === b.length && timingSafeEqual(a, b);
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      return send(res, 200, html(`<h1>Test partner</h1><p>Plays the role of a learning platform.</p>
<form action="/launch"><p><label>ClueQuest quiz ID<br><input name="quizId" required style="width:100%"></label></p>
<p><label>Assignment reference<br><input name="assignmentRef" value="assignment-1"></label></p>
<p><label>Learner reference<br><input name="learnerRef" value="student-42"></label></p>
<p><label>Type <select name="type"><option>solo</option><option>cbt</option></select></label>
<label>Style <select name="style"><option>points</option><option>steps</option></select></label></p>
<button>Launch assignment</button></form><p><a href="/results">Received results</a></p>`));
    }
    if (req.method === 'GET' && url.pathname === '/launch') {
      const q = Object.fromEntries(url.searchParams);
      const body = {
        quizId: q.quizId, assignmentRef: q.assignmentRef ?? 'assignment-1', learnerRef: q.learnerRef ?? 'student-42', learnerName: q.learnerName,
        returnUrl: `http://localhost:${PORT}/class?assignment=${encodeURIComponent(q.assignmentRef ?? 'assignment-1')}`,
        activity: {
          type: q.type ?? 'solo', style: q.style ?? 'points', steps: { wrong: q.wrong ?? 'stay' },
          passMarkPercent: q.pass ? Number(q.pass) : 50, attemptLimit: q.attempts ? Number(q.attempts) : 1,
          ...(q.type === 'cbt' ? { durationMinutes: Number(q.duration ?? 20) } : {}),
        },
      };
      const r = await fetch(`${CLUEQUEST}/api/partner/v1/launches`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) return send(res, 502, html(`<h1>Launch failed</h1><pre>${JSON.stringify(j, null, 2)}</pre>`));
      res.writeHead(302, { location: j.launchUrl }); return res.end();
    }
    if (req.method === 'GET' && url.pathname === '/class') return send(res, 200, html(`<h1 id="back">You are back in class</h1><p>Assignment: ${url.searchParams.get('assignment') ?? ''}</p>`));
    if (req.method === 'POST' && url.pathname === '/webhooks/cluequest') {
      const body = await readBody(req);
      const eventId = String(req.headers['x-cluequest-event-id'] ?? '');
      const valid = verify(req.headers, body);
      deliveries.push({ at: new Date().toISOString(), eventId, valid, attempt: req.headers['x-cluequest-delivery-attempt'], failed: false });
      if (!valid) return send(res, 401, '{"error":"bad signature"}', 'application/json');
      if (failNext > 0) { failNext--; deliveries.at(-1).failed = true; return send(res, 500, '{"error":"simulated outage"}', 'application/json'); }
      const dup = events.has(eventId);
      if (!dup) events.set(eventId, JSON.parse(body));
      return send(res, 200, JSON.stringify({ ok: true, duplicate: dup }), 'application/json');
    }
    if (req.method === 'GET' && url.pathname === '/results') return send(res, 200, JSON.stringify({ results: [...events.values()], deliveries }, null, 2), 'application/json');
    if (req.method === 'POST' && url.pathname === '/reset') { events.clear(); deliveries.length = 0; failNext = 0; return send(res, 200, '{"ok":true}', 'application/json'); }
    if (req.method === 'POST' && url.pathname === '/fail') { failNext = Number(url.searchParams.get('n') ?? 1); return send(res, 200, JSON.stringify({ failNext }), 'application/json'); }
    send(res, 404, 'not found', 'text/plain');
  } catch (e) { send(res, 500, String(e), 'text/plain'); }
}).listen(PORT, () => console.log(`Test partner on http://localhost:${PORT} (ClueQuest at ${CLUEQUEST})`));
