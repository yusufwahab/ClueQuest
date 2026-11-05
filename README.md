# ClueQuest

A general-purpose quiz platform. A teacher writes a quiz once, publishes it, and uses the same published questions for **solo practice**, a **live multiplayer game**, a **CBT exam**, or an **assignment launched from another platform**. Participation (solo / live / CBT) and scoring style (**Points** / **Steps**) are independent choices, and academic **marks** are always tracked separately from game points and step position.

Built from the technical base of ElimQuest (kept untouched in its own folder). See [docs/REUSE.md](docs/REUSE.md) for what was reused and what was replaced.

## Layout

| Path | What |
|---|---|
| `apps/web` | React + Vite + Tailwind v4 + React Router + TanStack Query |
| `apps/server` | Express + Socket.IO + Zod + `jose`; PostgreSQL via `pg` (prod) or PGlite (dev/test) |
| `packages/game-core` | Pure rules: grading (marks / points / steps), standings, nicknames, room codes |
| `packages/contracts` | Zod schemas shared by web and server, partner result payload type |
| `packages/config` | Brand, limits, theme tokens |
| `database/migrations` | SQL migrations |
| `tools/test-partner` | Zero-dependency local stand-in for a learning platform |
| `tests/e2e` | Playwright journeys |
| `docs/` | Partner contract, reuse notes, handover |

## Run locally (no accounts or credentials needed)

```bash
npm install                                   # Node >= 22
cp apps/server/.env.example apps/server/.env  # then set SEED_DEV_DATA=true for the demo teacher + test partner
npm run dev:server                            # API + Socket.IO on :8790, in-memory/PGlite database
npm run dev:web                               # http://localhost:5174
npm run dev:partner                           # optional: test partner on http://localhost:4600
```

Demo teacher (only with `SEED_DEV_DATA=true`): `host@dev.local` / `devpassword1`. Or register a new account on the sign-in page.

## AI assistant (optional, free)

Hosts can open **AI assistant** in the quest editor, fill a short form (topic, optional notes, how many, difficulty, level, language) and get a full draft to review. One request builds the whole draft; students never trigger AI. Add a free key to `apps/server/.env` and restart the server:

```
GEMINI_API_KEY=...   # https://aistudio.google.com/apikey  (tried first)
GROQ_API_KEY=...     # https://console.groq.com/keys       (used if Gemini is busy)
```

Neither key set = the assistant explains it is off. `AI_MOCK=true` gives fake offline questions for trying the flow. Each host gets `AI_DAILY_LIMIT` generations a day (default 20). Free-tier limits and model names change; edit `GEMINI_MODEL` / `GROQ_MODEL` if a model is retired.

## Question pictures and maths

Hosts can add a picture to a question and write maths between dollar signs (`$x^2 + 1$`; `$$...$$` for a line of its own). Maths is drawn by KaTeX, which is only downloaded when a page contains maths.

Pictures are shrunk in the browser, uploaded to the server, and stored on **Cloudinary** when `CLOUDINARY_URL` is set (copy it from Cloudinary's dashboard under Settings > API Keys). Learners then load them from Cloudinary's CDN, resized and compressed for their device. Set it on the server (Render) only; the website needs nothing. Without it, pictures are kept in the database, which is fine for development but not recommended for production.

## Checks

```bash
npm run typecheck
npm run lint
npm test                 # vitest: scoring rules + server integration (real sockets, PGlite, fake partner)
npm run test:e2e         # builds the web app, then Playwright (needs `npx playwright install chromium` once)
```

## Production notes

`NODE_ENV=production` refuses PGlite, dev seeding and disabled rate limits, and requires `DB_DRIVER=pg`, `DATABASE_URL` and a 32+ character `AUTH_SECRET`. Run `npm run migrate -w @cluequest/server` to apply migrations. Live rooms are owned by a single server process (as in ElimQuest); do not run multiple instances without adding room-ownership coordination.

### Deploy: website on Vercel, server on Render

- **Render (server):** Build `npm install --include=dev && npm run build -w @cluequest/web && npm run build -w @cluequest/server`, Start `npm run start -w @cluequest/server`, health check `/healthz`. Set the production variables from `apps/server/.env.example`, with `PUBLIC_WEB_URL` and `ALLOWED_ORIGINS` set to the **Vercel** address (comma-separate several origins, no spaces). The server also serves the website itself, so the Render address works on its own too.
- **Vercel (website):** import the repo with the **repo root** as the project root; `vercel.json` sets the install, build, output folder and the page rewrite. Add one environment variable: `VITE_API_URL=https://<your-render-service>.onrender.com`. It is read at build time, so redeploy after changing it.
- With `VITE_API_URL` empty the website talks to its own address (local development and the Render-only setup).

## Partner integration

[docs/PARTNER_INTEGRATION.md](docs/PARTNER_INTEGRATION.md) has the contract, example launch and result payloads, and how to verify with the local test partner.
