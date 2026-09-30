# ReachInbox – Full-stack Email Job Scheduler

A production-style email scheduler: an **Express + TypeScript API**, a **BullMQ worker** backed by **Redis**, **PostgreSQL** (Prisma) as the source of truth, **Elasticsearch** for search, **Ethereal** for fake SMTP delivery, **Slack OAuth** for rate-limit alerts, and a **React + Tailwind** dashboard built from the provided Figma.

No cron anywhere: every send is a BullMQ **delayed job**.

```
reachinbox-email-scheduler/
├── docker-compose.yml        Postgres 16, Redis 7 (AOF), Elasticsearch 8
├── backend/
│   ├── prisma/               schema + migrations
│   ├── src/
│   │   ├── server.ts         API entrypoint (Express, Bull Board)
│   │   ├── worker.ts         BullMQ worker entrypoint (run 1..N of these)
│   │   ├── routes/           auth (Google + email), emails/campaigns, slack
│   │   ├── services/         scheduler, rateLimiter (Lua), mailer, search, slack
│   │   ├── worker/           processEmail.ts – the job processor
│   │   └── lib/              prisma, redis, time-window helpers, logger
│   ├── scripts/load-test.ts  schedules 1000 emails for the same instant
│   └── test/                 vitest unit tests
├── frontend/
│   └── src/
│       ├── api/              typed client, response types, React Query hooks
│       ├── components/ui/    Button, Input, Avatar, StatusBadge, Popover, EmptyState, Spinner
│       ├── components/…      layout (Sidebar, UserMenu), compose, emails, integrations
│       ├── pages/            Login, Emails (Scheduled/Sent), EmailDetail, Compose
│       └── lib/              lead parsing (CSV/TXT), formatting
└── samples/leads.csv         sample upload file
```

---

## 1. Running it

Prerequisites: Node 20+, Docker.

### Infra (Postgres, Redis, Elasticsearch)

```bash
docker compose up -d
```

Host ports default to 5432 / 6379 / 9200. If they're taken, create a root `.env` (read by compose), e.g.
`POSTGRES_PORT=5433`, `REDIS_PORT=6380`, and point `DATABASE_URL` / `REDIS_URL` in `backend/.env` at them.

### Backend (API + worker)

```bash
cd backend
cp .env.example .env          # then fill in the values described below
npm install
npx prisma migrate deploy     # creates the tables
npm run dev                   # starts API (:4000) AND one worker, with hot reload
```

Run them separately (or scale workers horizontally) with:

```bash
npm run dev:api
npm run dev:worker            # start as many as you like – all limits are Redis-backed
```

Production: `npm run build && npm run start:api` / `npm run start:worker`.

- API: http://localhost:4000
- **Live BullMQ dashboard (Bull Board): http://localhost:4000/admin/queues** (also linked from the sidebar;
  optional basic auth via `BULL_BOARD_USER` / `BULL_BOARD_PASSWORD`)

### Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Vite proxies `/api` and `/admin/queues` to the backend, so the session cookie is first-party and there is no CORS setup.

### Tests

```bash
cd backend && npm test        # hour-window / overflow ordering / schedule spacing
cd frontend && npm test       # CSV/TXT lead parsing
```

---

## 2. Configuration

### Ethereal Email (fake SMTP)

Nothing to do by default: on first start the API creates `ETHEREAL_SENDER_COUNT` (default **3**) Ethereal
accounts through Ethereal's API and stores them in Postgres, so the same inboxes are reused after restarts.
Their addresses are logged and appear in the compose screen's **From** dropdown.

To use your own accounts instead, create them at https://ethereal.email/create and set
`ETHEREAL_ACCOUNTS=user1@ethereal.email:pass1,user2@ethereal.email:pass2`.

Every sent email's detail page links to its **Ethereal preview URL**, so you can open the delivered message.

### Google OAuth (login)

1. Google Cloud Console → *APIs & Services → Credentials → Create OAuth client ID* (Web application).
2. Authorised redirect URI: `http://localhost:5173/api/auth/google/callback`
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (and `GOOGLE_REDIRECT_URI` if you changed it).

The backend performs the code exchange, verifies the ID token, upserts the user (name, email, avatar), and sets an
httpOnly JWT session cookie. The email/password form from the Figma also works: the first login with a new email registers it (bcrypt-hashed password).

### Slack OAuth (rate-limit alerts)

1. https://api.slack.com/apps → *Create New App* → *From scratch*.
2. *OAuth & Permissions* → add bot scopes **`incoming-webhook`** and **`chat:write`**.
3. Slack only accepts **HTTPS** redirect URLs, so expose the frontend with a tunnel:
   `ngrok http 5173` (or `cloudflared tunnel --url http://localhost:5173`).
4. Add redirect URL `https://<your-tunnel>/api/integrations/slack/callback` in Slack and set the same value as
   `SLACK_REDIRECT_URI`. Set `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`.
5. In the dashboard click **Connect Slack**, pick a channel, and you're back with a confirmation message posted to
   that channel. **Test** sends a message on demand; **Disconnect** revokes the token and deletes the integration.

The signed `state` parameter identifies the user on the callback (CSRF-safe, and works even though the tunnel domain
doesn't carry the localhost session cookie).

### Throughput & rate-limit settings (`backend/.env`)

| Variable | Default | Meaning |
|---|---|---|
| `WORKER_CONCURRENCY` | `5` | Jobs processed in parallel per worker process |
| `MIN_DELAY_BETWEEN_SENDS_MS` | `2000` | **Minimum 2 seconds between two sends from the same sender**, across all workers |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `200` | Hard ceiling per sender per clock hour |
| `DEFAULT_CAMPAIGN_HOURLY_LIMIT` | `100` | Used when the compose form's *Hourly Limit* is left empty |
| `SEND_MAX_ATTEMPTS` | `3` | SMTP retries (exponential backoff from 30 s) before an email is marked `failed` |

---

## 3. Architecture

```
 React dashboard ──/api──▶ Express API ──▶ Postgres (campaigns, emails: source of truth)
                               │   └────▶ Elasticsearch (search index, best-effort)
                               └─ addBulk(delayed jobs, jobId = email id) ─▶ Redis / BullMQ
                                                                               │
                              Worker(s) ◀──────────── delayed job becomes due ─┘
                                 ├─ Redis Lua: hourly counters (sender + campaign)
                                 ├─ Redis Lua: per-sender send-gap reservation
                                 ├─ Postgres: compare-and-set claim scheduled → sending
                                 ├─ Ethereal SMTP (nodemailer, pooled per sender)
                                 └─ Slack webhook when a limit is reached
```

### How scheduling works

1. `POST /api/campaigns` validates input (zod), dedupes recipients, and computes
   `scheduledAt[i] = startAt + i × delayBetweenEmails` (the compose screen's *Delay between 2 emails*).
2. In **one DB transaction** it inserts the `Campaign` and one `Email` row per recipient (`status = scheduled`).
3. It enqueues one BullMQ **delayed job per email** via `addBulk` (500 per chunk), with
   `delay = scheduledAt − now` and a **deterministic `jobId = email-<emailId>`**.
4. It bulk-indexes the emails into Elasticsearch.

When a delay elapses, BullMQ moves the job to *wait*, and a worker runs `processEmail`:

1. Load the email. If it's already `sent` or `failed`, do nothing (**idempotent**).
2. Reserve an hourly slot for **both** the sender and the campaign (atomic Lua, see below). If either is full, move the job to the next hour window.
3. Reserve the sender's next free send time (min-gap pacing) and wait for it.
4. **Claim** the row: `UPDATE … SET status='sending' WHERE id=? AND status='scheduled'`. Zero rows updated means another worker has it, so give the slot back and stop.
5. Send via SMTP with a deterministic `Message-ID: <emailId@…>`.
6. Write a Redis "sent" marker, then mark the row `sent` (with `sentAt`, `messageId`, preview URL) and update ES.
7. On SMTP error, BullMQ retries with exponential backoff. The row goes back to `scheduled`, or to `failed` after the last attempt.

### Persistence across restarts

- **Postgres is the source of truth.** Redis only holds *pointers* (email ids) and timing.
- **Redis runs with AOF** (`appendonly yes`, `noeviction`), so delayed jobs survive a Redis restart too.
- Delayed jobs live in Redis, not in the Node process. Stopping the API and worker loses nothing. On restart, BullMQ picks up every delayed job at its original time, and overdue ones run immediately. Jobs a crashed worker was holding are recovered by BullMQ's stalled-job detection (`lockDuration` 60 s).
- **Startup reconciliation** (`reconcileQueue`, run by every worker on boot):
  - Rows stuck in `sending` for more than 5 minutes (a crash mid-send) go back to `scheduled`.
  - Every `scheduled` row must have a job. Any missing job is re-added with its **stored `scheduledAt`**, not restarted from scratch. This covers a Redis wipe, or the API crashing between the DB commit and the enqueue. Because job ids are deterministic, reconciliation never duplicates an existing job.

**Verified manually:**
- Scheduled emails 45 s ahead, killed both processes, and restarted after the due time. Each email was sent exactly once (`attempts = 1`).
- Ran `FLUSHALL` on Redis and restarted the worker. It logged `requeued: 5`, and all future jobs were back at their original times.

### Idempotency (no email sent twice)

The protections are layered:

| Layer | Protects against |
|---|---|
| `jobId = email-<id>` | The same email being enqueued twice (API retry, reconciliation) |
| Terminal-state check (`sent`/`failed` → skip) | Re-running a finished job |
| Compare-and-set claim (`scheduled → sending`) | Two workers or two job copies processing the same email concurrently |
| `sending` lock with 5-min staleness; a fresh lock defers the job instead of sending | A stalled-job re-run while the original worker is still mid-send |
| Redis `email:sent:<id>` marker written right after SMTP accepts | A DB write failing after a successful send; the retry only finalises the row |
| Deterministic `Message-ID` | The unavoidable last-resort window (process killed *between* SMTP accept and the marker write). Receiving MTAs can dedupe on it |

`@@unique([campaignId, toEmail])` also blocks duplicate recipients inside a campaign.

### Rate limiting & concurrency

**Worker concurrency.** `WORKER_CONCURRENCY` sets parallel jobs per process, and you can run any number of worker processes. Nothing is kept in process memory. Every piece of shared state is either an atomic Redis Lua script or a DB compare-and-set, so parallel jobs can't race.

**Hourly limits (Redis counters).** Keys are `rl:sender:<senderId>:<hourWindow>` and `rl:campaign:<campaignId>:<hourWindow>`, where `hourWindow = floor(epochMs / 3_600_000)`, i.e. fixed, clock-aligned UTC hours. One Lua script checks both limits and increments both counters atomically, or reserves nothing. Keys expire one hour after their window ends.
- **Sender limit:** `MAX_EMAILS_PER_HOUR_PER_SENDER`, from env.
- **Campaign limit:** the *Hourly Limit* entered in the compose form. The sender ceiling always applies on top.

**When a limit is hit, jobs are never dropped or failed.**
- The job is moved with `job.moveToDelayed(...)` + `DelayedError`, so no retry attempt is consumed.
- Its new time is **the start of the next hour window + position × send-gap**. The position is a ticket from a Redis counter `rl:overflow:<scope>:<id>:<nextWindow>`, so jobs re-run in the order they overflowed and don't all wake in the same millisecond.
- The row's `scheduledAt` and `rescheduleCount` are updated. The dashboard shows the new time plus a *rate-limited* tag.
- If the next hour fills up as well, the remainder rolls again, still in order.

**Delay between emails.**
- *Per campaign:* recipients are spaced by the compose form's delay when they are scheduled.
- *Per sender (throttling):* before sending, the worker atomically books the sender's next free send time in Redis (`rl:gap:<senderId>`, using Redis `TIME`, so worker clocks don't matter) and waits for it.
- Result: at least `MIN_DELAY_BETWEEN_SENDS_MS` between two sends from the same sender, across all workers. Different senders proceed in parallel. BullMQ keeps renewing the job lock during the short wait.

> I first used BullMQ's built-in `limiter`, but the load test exposed a problem. The limiter throttles *every* job, including those that are only being moved to the next hour, so rotating 1000 overflowed jobs took about 33 minutes. The processor-level gap only paces actual sends. Overflowed jobs are rescheduled almost instantly, and each sender gets its own pace.

**Slack alert when a limit is reached.**
- The alert fires on the send that *reaches* the limit (or on the first rejection), once per scope per window. This is deduped with `SET NX` on `rl:notified:<scope>:<id>:<window>`.
- It is posted to the campaign owner's Slack incoming webhook and says when sending resumes.
- The integration is read from the DB on every alert. No Slack connection means no message and no error. Connecting later works immediately, without a redeploy.
- A webhook Slack reports as revoked is cleaned up automatically.

### Behaviour under load (1000+ emails at the same time)

`npm run load-test -- 1000 20` (1000 recipients, delay 0, campaign limit 20). Measured locally:

- API accepted and persisted all 1000 in ~1.2 s (single transaction + `createMany`, `addBulk` in chunks of 500, ES bulk index).
- Exactly **20 sent** in the current hour (2 s apart), **1 Slack alert**, and **980 moved** to the next hour. They were spread from `14:00:00` to `14:32:38` (2 s apart) within seconds.
- Ordering: 945 of 980 kept exact recipient order; the other 35 are small swaps from 5 concurrent jobs taking overflow tickets. With `WORKER_CONCURRENCY=1` the order is exact.

Throughput ceiling per sender = `min(MAX_EMAILS_PER_HOUR_PER_SENDER, 3600 s / MIN_DELAY)`. Add senders or workers to scale out.

### Search (Elasticsearch)

- Every email is indexed on creation and updated on every status change: subject, recipient, sender, plain-text body, status, times.
- The search bar on both tabs calls `GET /api/emails?tab=…&q=…`. It combines a **typo-tolerant** match (`fuzziness: AUTO`, so "restrt" finds "Restart") with a **search-as-you-type** prefix match. Results are always scoped to the current user and tab.
- Rows are hydrated from Postgres, so what you see is current.
- If ES is down, indexing is skipped with a warning and search falls back to a Postgres `ILIKE`. Scheduling and sending never depend on ES.

---

## 4. API

| Method | Path | |
|---|---|---|
| GET | `/api/auth/google` → `/api/auth/google/callback` | Google OAuth |
| POST | `/api/auth/login` | Email + password (registers on first use) |
| GET | `/api/auth/me` · POST `/api/auth/logout` | Session |
| GET | `/api/senders` | Ethereal sender pool |
| POST | `/api/campaigns` | Schedule `{ senderId, subject, body, recipients[], startAt?, delaySeconds, hourlyLimit? }` |
| GET | `/api/emails?tab=scheduled\|sent&q=&page=&pageSize=` | List / search |
| GET | `/api/emails/stats` · `/api/emails/:id` | Counters · detail |
| GET | `/api/integrations/slack` · `/connect` · `/callback` | Slack status / OAuth |
| POST · DELETE | `/api/integrations/slack/test` · `/api/integrations/slack` | Test message · disconnect |
| — | `/admin/queues` | Bull Board |

Postman-style example:

```bash
curl -c jar -X POST localhost:4000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"password123"}'
curl -b jar localhost:4000/api/senders
curl -b jar -X POST localhost:4000/api/campaigns -H 'content-type: application/json' -d '{
  "senderId":"<id>","subject":"Hello","body":"<p>Hi!</p>",
  "recipients":["a@example.com","b@example.com"],
  "startAt":"2026-10-01T09:00:00Z","delaySeconds":5,"hourlyLimit":50}'
```

---

## 5. Features implemented

**Backend**
- **Scheduler:** BullMQ delayed jobs, no cron; bulk enqueue; per-campaign start time and spacing.
- **Persistence:** Postgres as the source of truth, Redis AOF, deterministic job ids, and startup reconciliation that recovers stuck sends and re-adds missing jobs at their original time. Graceful worker shutdown drains in-flight jobs.
- **Idempotency:** six layers (see table above).
- **Rate limiting:** atomic Redis Lua counters per sender (env) and per campaign (UI), fixed hourly windows, and ordered overflow into the next window. Jobs are never dropped.
- **Delay between sends:** Redis-reserved per-sender gap, safe across workers. The default is at least 2 s between sends from the same sender.
- **Concurrency:** configurable per worker; any number of workers.
- **Multiple senders:** an auto-provisioned Ethereal pool with pooled SMTP transports.
- **Slack:** real OAuth v2, per-user storage, alert when a limit is reached, test, disconnect/reconnect, stale-webhook cleanup.
- **Elasticsearch:** indexing plus fuzzy/prefix search, with a DB fallback.
- **Bull Board:** live queue dashboard.
- **Retries:** exponential backoff; `failed` status with the error message.

**Frontend** (React 18, TypeScript, Tailwind, React Query, TipTap)
- **Login:** real Google OAuth, plus email/password as in the Figma. The sidebar user card shows name, email and avatar, with a Logout menu.
- **Dashboard:** Figma layout with sidebar, Compose button, Scheduled/Sent counts, a search bar, and list rows (recipient, status pill with time, subject + preview).
- **Live updates:** lists and counters refresh every 5 s, so you can watch emails move from Scheduled to Sent.
- **Compose:**
  - From (sender picker) and To with recipient chips, "+N" overflow, paste/typing, and **Upload List** for CSV/TXT, showing the number of emails detected.
  - Subject, *Delay between 2 emails*, and *Hourly Limit*.
  - Rich-text body with the Figma toolbar.
  - A **Send Later** popover with date/time picker and presets. The button toggles between *Send* and *Send Later*.
- **Tables:** loading skeletons, empty states, error state with retry, pagination, and badges for `scheduled`, `sending`, `sent`, `failed` and *rate-limited*.
- **Email detail:** sanitised HTML body (DOMPurify), delivery metadata, attempts, errors, and the Ethereal preview link.
- **UX:** toasts for success and errors, validation messages, and reusable UI components.

---

## 6. Assumptions, shortcuts & trade-offs

- **Hour windows are fixed clock hours (UTC), not sliding windows.** They are simple, cheap and exact to count. The trade-off is a possible burst at the boundary: up to 2× the limit across two adjacent half-hours.
- **The hourly slot is counted when the job starts, not when SMTP completes.** Failed sends still use their slot, which is conservative towards the provider.
- **Pacing waits inside the worker.** A job waiting for its sender's gap holds a concurrency slot for a few seconds. The alternative, re-delaying the job, produced thundering-herd retries. Waits are bounded by roughly concurrency × gap.
- **Order under overflow is best-effort with concurrency > 1** (measured 96% exact on 1000 jobs), and exact with concurrency 1.
- **Exactly-once delivery is impossible over SMTP.** If the process dies after SMTP accepts but before the Redis marker is written, the stale-lock recovery can send a second copy. It carries the same `Message-ID`, so receivers can dedupe.
- **The sender pool is global** (shared Ethereal accounts), not per user. Each user's data (campaigns, emails, Slack) is isolated by `userId`.
- **Attachments aren't supported.** The Figma paperclip icon was left out rather than shipped as a non-working button. The filter icon is shown disabled; search covers filtering.
- **The Figma logo "ONB" is used as-is** (Silkscreen font) so the layout matches the design.
- **Slack requires an HTTPS redirect URL,** so a tunnel (ngrok/cloudflared) is needed locally.
- **Elasticsearch runs with security disabled** in docker-compose, for local development only.
