# What came from ElimQuest, and what did not

Source inspected: `Desktop/ilm-quest` (its README, package scopes and structure identify it as ElimQuest). It was only read and copied from; it was not modified.

## Reused as-is or near-as-is

- Monorepo shape and tooling: npm workspaces, Vite + React 19 + Tailwind v4 + React Router + TanStack Query, Express 5 + Socket.IO + Zod, `tsx`, esbuild, Vitest, Playwright, ESLint config.
- Database layer (`db/db.ts`): the `Db` interface over `pg` (production) and PGlite (dev/test), the transaction wrapper and the SQL migration runner.
- `db/util.ts` (HttpError, query helpers, sha256), `ratelimit.ts` (memory/Redis counters), `email.ts` Mailer (log/Brevo modes, now with an invitation email).
- Game-core pieces: seeded RNG and per-player option shuffling, nickname validation and de-duplication, room codes, tie-sharing rank (1,1,3), deadline-with-grace rule.
- Patterns: server-authoritative deadlines with an answer grace window, one answer per player per question enforced by a database key, token-based guest identity (no cookies), per-socket rate bucket, ack-based socket commands, timer re-arming after restart, env validated at boot with production guards.

## Changed

- Domain model: ElimQuest's reviewed question bank, categories, packs, review workflow, Islamic content, avatars and Phaser staircase are not carried over. ClueQuest stores teacher-authored quizzes with immutable published versions (questions, answer key, marks and points frozen per version).
- Scoring: ElimQuest's fixed "step up / step down" rules became two independent styles. Points: per-question reward, zero otherwise. Steps: +1 per correct, wrong/unanswered either stays or moves down 1 (teacher's choice), never below 0. Marks are a third, separate measure; pass/fail uses marks only.
- Questions: 2 to 6 options (was exactly 4), any subject, per-question marks and points.
- Auth: ElimQuest used Supabase in production and dev-only local accounts. ClueQuest uses its own email/password accounts (scrypt + signed JWT) in every environment, for teachers and hosts only. No Supabase dependency.
- Live game: rewritten for the new model. Standings are derived from stored answers rather than kept in memory, which is what makes reconnects safe. The host starts each round, answers lock at the deadline (+grace) or when the host locks them.
- Visual identity: new, subject-neutral, solid colours, no gradients or icons; Steps are a plain segmented bar with a text label.

## New

Teacher workspace and editor, solo / CBT attempt engine (autosave, review, server deadline, attempt limits, release rules), invitations, partner API (lookup, launch, signed webhook with outbox and retries), local test partner, Playwright journeys.

## Not carried over (by design)

Secrets (`.env`), the Supabase project, production data, the Islamic question bank and sample CSVs, the PGlite data directory, avatars, Phaser, room chat, reactions, admin question review, usage statistics.
