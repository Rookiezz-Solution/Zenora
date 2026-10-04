# Zenora — deployment, backup and operations runbook

What is written here is what the code does today. Hosting, DNS and the monitoring
vendor are **not chosen yet**; the places that depend on them say so. Nothing in this
file has been exercised on a real production host.

## What runs

| Part | Command (after `pnpm install && pnpm db:generate && pnpm build`) | Port | Notes |
|---|---|---|---|
| Web (Next.js) | `pnpm --filter @zenora/web start` | 3000 | Stateless. Needs `NEXT_PUBLIC_*` values **at build time**. |
| API (NestJS) | `pnpm --filter @zenora/api start` (`node apps/api/dist/main.js`) | `API_PORT` (4000) | Stateless; several instances are fine (rate limits are shared through Redis). |
| Worker (BullMQ) | `pnpm --filter @zenora/worker start` | none | Runs every background job and the scheduled sweeps. More than one is fine; the schedulers are idempotent. |
| Postgres | managed (Neon today) | 5432 | The only durable store. |
| Redis | managed (Upstash today) | 6379 | Queues, shared rate-limit counters, worker heartbeat, realtime fan-out. |

Run `pnpm db:migrate:deploy` **before** starting a new API/worker version (migrations are forward-only; see rollback).

## Environment

Required by the API (it refuses to start without them): `DATABASE_URL`, `AUTH_SECRET` (16+ chars; use 32+),
`TOKEN_ENCRYPTION_KEY` (64 hex chars: `openssl rand -hex 32`). Also set in production:

- `NODE_ENV=production` (secure cookies, HSTS), `APP_URL`, `API_URL`, `REDIS_URL`, `SUPER_ADMIN_EMAILS`.
- `TRUST_PROXY=<number of proxies in front of the API>` — **required behind a load balancer**, otherwise every
  caller looks like the proxy and per-address limits lump everyone together. Leave unset when there is no proxy.
- Web build: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, and the Meta / Razorpay public ids.
- Never set `WEBHOOK_ALLOW_PRIVATE` in production (it disables the check that stops customer webhooks reaching internal services).
- The worker reads `DATABASE_URL`, `REDIS_URL` and `TOKEN_ENCRYPTION_KEY` from the same environment.

Third-party credentials (Google, Meta, Razorpay, Anthropic, SMS) are **entered in the dashboard** at
`/admin/integrations` by a super admin, encrypted with `TOKEN_ENCRYPTION_KEY`; they are not environment variables
(the env names still work as a fallback). `.env` is never committed.

## Email

Verification codes and password-reset emails go out through **any SMTP server**, configured by a super admin at `/admin/integrations` → *Email (SMTP)* (server, port, username, password, from address; secrets are write-only and encrypted). Nothing is sent until it is configured, and the app says so honestly instead of pretending: password reset then answers "can't be sent yet" for everyone alike. Use a server and a from-address on a domain you have verified with the provider (SPF/DKIM), or messages will land in spam. SMS codes still have no provider; a phone number can only be verified in development.

## Health and monitoring

- `GET /health` — liveness (process is up; touches nothing else). Use for "restart if it fails".
- `GET /health/ready` — readiness. `200` when Postgres and Redis answer; `503` otherwise. The body also reports
  `worker: up | down | unknown`, from a heartbeat the worker writes to Redis every 30 s (expires after 2 min).
  A `down` worker does **not** fail readiness (it is a separate process) — **alert on it separately**.
- Suggested alerts: readiness failing for > 2 min; worker heartbeat down for > 5 min; API 5xx rate; Razorpay and
  Meta webhook endpoints returning non-2xx; BullMQ `failed` count growing.
- **There is no error-tracking or log-shipping service wired in.** Logs go to stdout (Nest logger). Choosing
  one (Sentry, Better Stack, …) is an open decision; until then rely on the platform's log search.

## Backups and restore

Postgres is the system of record. Everything else can be rebuilt.

- **Neon:** point-in-time restore is available within the plan's history window (check the window on the plan in use;
  free plans keep very little). Enable it, and know the window. To restore: create a branch from a timestamp, check it,
  then point `DATABASE_URL` at it (or copy the data back).
- **Independent copy (recommended, not set up):** a nightly logical dump kept outside the database vendor:
  `pg_dump --format=custom --no-owner "$DATABASE_URL" > zenora-$(date +%F).dump`, stored encrypted off-site, with
  retention you choose. Restore into an empty database with `pg_restore --no-owner -d "$TARGET_URL" file.dump`, then
  run `pnpm db:migrate:deploy`.
- **Restore drill:** nobody has restored a backup yet. Do it once into a scratch database and time it; until then the
  recovery time is unknown. Target RPO/RTO have not been decided.
- **Redis:** holds queued jobs and counters, not source data. Webhook events from Meta are stored in Postgres before
  they are acknowledged, so a Redis loss can delay processing but not lose them. After a Redis loss, restart the worker:
  it re-creates its schedulers (reminders, retention, workspace deletion, subscription lifecycle) on boot.
  Enable persistence (AOF) on Redis if queued broadcasts / sequence steps must survive a restart.
- **Customers' own copies:** workspace owners can download everything from Settings → Privacy.

## Secrets and rotation

| Secret | Rotating it |
|---|---|
| `AUTH_SECRET` | Signs sessions and OAuth state. Changing it signs **everyone out**; safe, nothing is lost. |
| `TOKEN_ENCRYPTION_KEY` | Encrypts channel tokens, calendar tokens, ad tokens, integration credentials and webhook secrets at rest. **Do not just change it** — every stored value would become unreadable. Use the rotation tool: `OLD_TOKEN_ENCRYPTION_KEY=<current> NEW_TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32) pnpm rotate-key` is a dry run that reports counts and changes nothing; add `--apply` to rotate. It is one transaction (all or nothing), refuses to run if any value opens with neither key, is safe to re-run, and reads everything back with the new key before it reports success. Then set `TOKEN_ENCRYPTION_KEY` to the new key for the API **and** the worker, restart both, and keep the old key until you have checked the app. Take a database backup first. |
| Razorpay / Meta / Google / Anthropic keys | Replace in `/admin/integrations`; takes effect within seconds. |
| `SUPER_ADMIN_EMAILS` | Env only (so it cannot be edited from the UI); redeploy to change. |

Back up the keys themselves in a password manager or secrets store: **losing `TOKEN_ENCRYPTION_KEY` loses every
stored integration credential and channel token.**

## Releasing and rolling back

1. CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build; dependency advisories are reported, not blocking.
2. Deploy order: migrate → API and worker → web. Old and new API versions overlap during a rolling deploy, so keep
   migrations backward-compatible with the previous version (add columns/tables first; remove them in a later release).
3. Rolling back code is a redeploy of the previous build. **Migrations are not rolled back**; a bad migration is fixed
   forward (or by a point-in-time restore, which also discards newer data).
4. After a deploy check `/health/ready`, sign in, open Home, and watch the worker log for errors.

## Common incidents

- **Customers say messages stopped arriving:** check the worker heartbeat, then the `webhook-ingress` queue backlog and
  recent `MetaWebhookEvent` rows. Meta retries for a while, and events are stored before they are acknowledged.
- **Sign-in errors for everyone:** usually Redis or the database; see `/health/ready`. Rate limits fail open if Redis is down.
- **Razorpay webhook events to enable:** `payment.captured` and `refund.processed`. Without the second, refunds are not reflected (invoice stays "paid", commissions stay).
- **Payments not applying:** Razorpay's webhook is the source of truth; check its delivery log for non-2xx responses.
  Applying a payment is idempotent, so replaying the event is safe.
- **Account takeover report:** the person can use Profile → "Sign out of all devices" once back in. If they cannot, bump their session version directly: `UPDATE "User" SET "sessionVersion" = "sessionVersion" + 1 WHERE email = '…'` (effective within ~15 s on every API instance); there is no admin screen for this yet.
- **Workspace deletion requested by mistake:** there is a 7-day grace period; the owner can cancel in Settings → Privacy.

## Open decisions before launch

Hosting provider and regions · monitoring/error-tracking vendor · backup retention and RPO/RTO · a mail provider and
verified sending domain (password reset is built, using SMTP; invites and billing notices are not yet) · a lawyer review of the draft
terms and privacy policy · an external penetration test.
