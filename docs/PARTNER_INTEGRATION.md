# Partner integration (v1)

ClueQuest is partner-agnostic. A partner (the first is MS Virtual Academy) is a row in `partners` with its own API key, webhook URL, webhook secret and list of approved return origins. Nothing in the quiz engine knows a partner's name or database.

There are three distinct ways to connect:

| Way | Identifies the student? | Results sent back? |
|---|---|---|
| **Public solo link** `/q/<code>` | No | No (teacher sees them in ClueQuest) |
| **Live room** code or `/join/<code>` | No (nickname only) | No |
| **Assignment launch** (this document) | Yes, via the partner's opaque `learnerRef` | Yes, signed webhook |

## Set up a partner

```bash
npm run partner:create -- --slug msva --name "MS Virtual Academy" \
  --webhook https://partner.example/hooks/cluequest --return https://partner.example
```

Prints the API key and webhook secret once. Only a hash of the key is stored. `--return` is the allow-list of origins that may be used as `returnUrl`.
In development, `SEED_DEV_DATA=true` creates a `testpartner` (key `cq_test_key_local_only`, secret `whsec_test_local_only`) pointing at the local test partner.

The teacher must tick **Let connected learning platforms assign this quiz** on the quiz's *Use* page. Until then partners get 404 for that quiz.

## 1. Quiz lookup

`GET /api/partner/v1/quizzes/{quizId}` with `Authorization: Bearer <api key>`

```json
{ "quizId": "9f0c…", "title": "Algebra basics", "subject": "Mathematics", "published": true, "version": 3,
  "questionCount": 10, "totalMarks": 10, "activityTypes": ["solo", "cbt"], "styles": ["points", "steps"] }
```

## 2. Assignment launch

`POST /api/partner/v1/launches` (partner **backend** only; the key never goes to a browser)

```json
{
  "quizId": "9f0c…",
  "assignmentRef": "class-7b/homework-12",
  "learnerRef": "stu_8f3a91",
  "learnerName": "Ada",
  "returnUrl": "https://partner.example/classes/7b/assignments/12",
  "activity": {
    "type": "solo",
    "style": "steps",
    "steps": { "wrong": "stay" },
    "passMarkPercent": 50,
    "attemptLimit": 1
  }
}
```

For `"type": "cbt"` also send `durationMinutes` (required) and optionally `opensAt` / `closesAt` (ISO 8601).

Response `201`:

```json
{ "launchUrl": "https://app.cluequest.example/launch/Zk3…", "expiresAt": "2026-11-01T15:15:00.000Z",
  "quizVersion": 3, "activityType": "solo", "style": "steps" }
```

Rules:

- The first launch for an `assignmentRef` **pins** the quiz version and the rules (style, pass mark, attempts, duration). Later launches for the same `assignmentRef` reuse them; a different `quizId` gets `409`.
- `learnerRef` is opaque to ClueQuest. Send the partner's own identifier, not an email or name.
- `returnUrl` must be on an approved return origin, otherwise `422`.
- The link is short-lived (`LAUNCH_TTL_MINUTES`, default 15) and can be opened repeatedly. Opening it only shows the quiz intro. The learner presses **Start**; if an attempt is already open for that `learnerRef`+assignment it is **resumed**, not duplicated. A finished learner at their attempt limit gets a "View your result" / "Return to class" screen, never a new attempt. Concurrent double-clicks are resolved by a database unique index.

## 3. Result delivery (signed webhook)

On submission (manual, or automatic at the CBT deadline even if the browser is closed) ClueQuest writes one outbox row per attempt and `POST`s it to the partner's `webhook_url`.

Headers:

```
X-ClueQuest-Event-Id: evt_<attemptId>
X-ClueQuest-Timestamp: 1793550000
X-ClueQuest-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
X-ClueQuest-Delivery-Attempt: 1
```

Points style:

```json
{ "eventId": "evt_6c1e…", "type": "attempt.submitted", "partnerAssignmentRef": "class-7b/homework-12", "learnerRef": "stu_8f3a91",
  "attemptId": "6c1e…", "quizId": "9f0c…", "quizVersion": 3, "activityType": "solo", "style": "points",
  "marksEarned": 7, "marksPossible": 10, "percent": 70, "passMarkPercent": 50, "passed": true,
  "points": 650, "pointsPossible": 1000, "submittedAt": "2026-11-01T15:04:11.000Z", "autoSubmitted": false }
```

Steps style carries `"stepPosition": 6, "stepMax": 10` instead of `points`/`pointsPossible`. Marks are always academic; `passed` depends on marks only.

Partner obligations:

1. Verify the signature over the **raw** body and reject timestamps older than ~5 minutes.
2. Return any `2xx` once stored. Anything else (or a timeout) is retried with exponential backoff (`WEBHOOK_BACKOFF_MS` × 2ⁿ, up to `WEBHOOK_MAX_TRIES`, default 30 s … 8 tries).
3. **De-duplicate on `eventId`.** Every retry of a result carries the same `eventId`, and there is exactly one logical event per attempt.

`GET /api/partner/v1/attempts/{attemptId}/result` returns the same payload for reconciliation (scoped to the calling partner).

## 4. Return journey

After submission the result screen shows **Return to class**, linking to the `returnUrl` given at launch. Result delivery does not depend on the learner pressing it.

## Scoping and security

- Credentials, activities, launches, attempts and outbox rows are all keyed by `partner_id`; one partner's key cannot read or launch another's data.
- Launch tokens and API keys are stored hashed. Attempt links are HMAC-derived from the attempt id with `AUTH_SECRET`.
- The partner can only attach quizzes whose owner has opted in.

## Verify locally (no MSVA changes needed)

```bash
npm run dev:server        # with SEED_DEV_DATA=true in apps/server/.env
npm run dev:web
npm run dev:partner       # http://localhost:4600
```

Open http://localhost:4600, paste a quiz ID (the quiz must be published and opted in), press **Launch assignment**, finish the quiz, then open http://localhost:4600/results. `POST /fail?n=2` makes the next two webhook deliveries return 500 to watch retries; the result still appears once.
