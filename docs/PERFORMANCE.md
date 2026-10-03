# Zenora — performance and load testing

First load test and tuning pass, 2026-10-12. Tooling: `scripts/load-test.mjs`
(no dependencies) and `ZENORA_LOG_QUERIES=true` (prints every SQL statement, to
count queries per request).

## How to run it
```bash
node scripts/load-test.mjs --api http://localhost:4000 \
  --email you@example.com --password '…' --workspace <workspace id> \
  --concurrency 20 --seconds 15            # optionally: --only leads,inbox,webhook
```
Run it against a staging copy, never production (`createlead` writes data tagged
`source: "loadtest"`). Seed volume first; this pass used 3,000 leads, 500
conversations, 12,500 messages and 800 tasks in one workspace.

## The most important caveat
These runs were made from a laptop to a database in another continent:
**every database round trip costs ~250 ms** (`SELECT 1` median 251 ms; Redis
~57 ms), and opening a new pooled connection costs several more. Almost every
latency below is therefore *(number of sequential round trips) × 250 ms* — a
request that makes one query takes ~270 ms, which is exactly one round trip. The
API's own overhead is tiny (`/health`, no database: 5,877 req/s, p50 2 ms).

So the absolute numbers say little about production, where the API runs next to
the database (≈1–2 ms). What carries over is the **number of queries and,
above all, the sequential depth per request**, and the correctness problems the
load exposed. Re-run the script from inside the production network before
drawing conclusions about capacity.

## Results (20 concurrent users, 10 s each, 250 ms database round trip)

| Endpoint | Before: req/s · p50 · p95 | After: req/s · p50 · p95 |
|---|---|---|
| `auth/me` (1 query) | 51 · 270 · 294 ms | 57 · 273 · 796 ms |
| Leads list (200 rows + tags) | 12 · 1,301 · 3,039 ms | 18 · 855 · 2,875 ms |
| One lead with relations | 7 · 2,432 · 4,185 ms | 10 · 1,613 · 3,239 ms |
| Inbox conversations | 11 · 1,377 · 3,103 ms | 14 · 991 · 3,385 ms |
| One conversation's messages | 21 · 873 · 1,382 ms | 33 · 538 · 1,306 ms |
| Pipelines | 32 · 590 · 852 ms | 64 · 273 · 560 ms |
| Tasks | 16 · 1,049 · 1,948 ms | 23 · 749 · 1,465 ms |
| Create lead (10 users) | 1 · 8,675 · 9,225 ms | 2 · 5,436 · 7,353 ms |

SQL statements per request (warm): billing usage 13 → 7, one lead 9 → 8,
pipelines 2 → 1, conversation messages 4 → 2.

## Problems found and fixed
1. **Meta webhook events were lost under burst (correctness).** The handler
   acknowledged Meta first and stored the event afterwards. Sending 21,000
   events in 10 s showed "2,099 req/s, p50 4 ms" — and only **1,388 events
   were actually stored (≈7 %)**: the background writes exhausted the
   database pool and failed after the 200 had already gone out, so Meta (which
   never resends after a 200) lost them. The event is now stored and queued
   **before** it is acknowledged; a failure returns 500 so Meta retries, and the
   content hash keeps the retry idempotent. Re-run: 260 sent, 260 stored.
2. **Billing usage (`/billing/:ws/usage`) is called by the sidebar on every
   page** and did three add-on queries plus a chain of sequential lookups. It is
   now one parallel batch with each table read once.
3. **Every request paid a database round trip to re-learn the caller's role.**
   Roles are now cached for 10 s and cleared immediately by any role change,
   removal or agency change made through the API (an instance that did not
   handle the change sees it within 10 s).
4. **Lead detail** loaded its relations one after another; they now load
   together (the workspace check is still on the lead row, and nothing from the
   relations is returned if it fails).
5. **Lead creation** ran ~20 mostly independent steps in a chain (routing reads,
   assignment, SLA timer, queue jobs, audit log). Independent reads and the
   tail are now parallel.

## Findings not changed
- The leads list returns up to 200 rows with their tags in three queries
  (leads, lead-tags, tags). With Prisma's `relationLoadStrategy: "join"` (a
  preview feature) it could be one; not adopted blindly.
- Lead creation is still ~20 statements. The routing engine could be moved to
  the worker so the API answers after the insert; that changes behaviour (the
  lead would appear before its owner is set) and needs a decision.
- No pagination on conversation or task lists beyond fixed `take` limits.
- Per-process rate limiters and caches (see `docs/SECURITY.md`).
- Production sizing: use the pooled Neon endpoint (already the case), keep the
  API in the database's region, and size Prisma's pool with `connection_limit`
  in `DATABASE_URL` for the number of API instances.
