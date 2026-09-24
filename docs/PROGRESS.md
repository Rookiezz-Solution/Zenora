# Zenora — build progress

## 2026-09-24 — Phase 0 kickoff

**Done**
- Reviewed CLAUDE.md, all of docs/, design/SCREENS.md, and the full clickable-design PDF export.
- Resolved an open contradiction found in the design pack: an agency "White label" screen (custom domain, agency-set billing) is **not in scope** — Zenora has no white-labelling or reselling; clients always pay Zenora directly, matching CLAUDE.md rule #3 and the Agency/Referral screens. Decided with the user 2026-09-24.
- Approved stack: pnpm + Turborepo monorepo, Next.js (`apps/web`), NestJS (`apps/api`), BullMQ (`apps/worker`), PostgreSQL + Prisma (`packages/db`), Redis. `apps/booking` folded into `apps/web` rather than a separate app.
- Scaffolded the monorepo: root tooling (pnpm-workspace, turbo, tsconfig base, eslint flat config, prettier), CI (`.github/workflows/ci.yml`: install → generate → lint → typecheck → test → build), `.env.example` covering every integration in docs/INTEGRATIONS.md.
- `packages/shared`: workspace roles/RBAC permission matrix, plan limits + credit weights (mirrors docs/PLANS_AND_LIMITS.md), default terminology labels, feature flag registry.
- `packages/db`: Prisma schema v1 covering Phase 0 tables (workspaces, users, memberships, teams, invites, OTP codes, audit log, feature flags, notifications) and Phase 1 tables (channels, leads/CRM, pipelines, inbox, automations, messaging, routing/tasks, billing/usage) per docs/ARCHITECTURE.md. Seed script creates a demo workspace, owner, default pipeline/stages, and feature flag rows.
- `apps/api` (NestJS): email/password auth, Google OAuth strategy, OTP request/verify (send step stubbed — logs the code instead of calling MSG91), JWT session in an httpOnly cookie, workspace CRUD + invites, `PermissionsGuard` enforcing the RBAC matrix per-workspace, `AuditService` used by workspace mutations, `/health`.
- `apps/worker` (BullMQ): boots, connects to Redis, registers one Worker per queue named in docs/ARCHITECTURE.md with a placeholder processor — real processors land as each Phase 1/2 service is built.
- `apps/web` (Next.js App Router): brand colour `#8B4FA8` + Bricolage Grotesque/Plus Jakarta Sans fonts wired via `next/font/google`; app shell sidebar matching the nav in design/screens (workspace switcher, Ctrl K search stub, AI credits meter stub, full nav list, notifications/help/profile); login, signup, phone OTP verify, forgot-password (stub — no email sender yet) pages wired to the API.
- Tests: `packages/shared` unit tests for `roleHasPermission` per role; `apps/api` unit tests for `PermissionsGuard` (allow/deny/no-membership/missing-workspace cases).

**Open questions / not yet decided**
- Partner commission % and duration are still literal placeholders (`[X]%`, `[N] months`) in the design — need real numbers before Phase 3 payout logic.
- WhatsApp per-message pricing and LLM rates in docs/INTEGRATIONS.md are marked "confirm current" — re-check before Phase 2 credit-weight math is finalized.

**Next**
- Install dependencies, run `db:generate`/`db:migrate`/`db:seed` against a local Postgres, verify `pnpm dev` boots web+api+worker together, and confirm CI passes on the first PR.

## 2026-09-24 — Phase 1 item 1: Meta webhooks, Instagram connect, WhatsApp Embedded Signup, message store

**Done**
- `packages/db`: added `MetaWebhookEvent` (raw inbound webhook store, idempotent by a sha256 of the payload — Meta doesn't always give a stable event id).
- `apps/api`: `TOKEN_ENCRYPTION_KEY`-based AES-256-GCM helper (`common/encryption.ts`) so every channel access token is encrypted before it touches Postgres (CLAUDE.md rule #8); `common/oauth-state.ts` signs a short-lived JWT `state` param so the Instagram OAuth callback can't be tricked into attaching a token to the wrong workspace.
- `apps/api` `channels` module:
  - `GET/POST /webhooks/meta` — verify handshake + signature-checked (`MetaSignatureGuard`, HMAC-SHA256 over the raw body) ingress that stores the raw event then enqueues it to the `webhook-ingress` BullMQ queue and acks Meta within the request (falls back to accepting unsigned requests only when `META_APP_SECRET` isn't set yet, so the pipeline is testable before a real Meta app exists).
  - `GET /channels/instagram/connect/:workspaceId` + `/callback` — full Facebook OAuth code exchange → long-lived token → lists Pages with a linked IG business account → connects the first one (multi-account picker is a follow-up, noted inline).
  - `POST /channels/whatsapp/connect/:workspaceId` — WhatsApp Embedded Signup code exchange, WABA webhook subscription, phone number lookup.
  - `MetaGraphClient` wraps the actual Graph API calls; nothing here talks to Instagram/WhatsApp except through the official Graph API (CLAUDE.md rule #1).
- `apps/api`: `QueueService` (BullMQ producer) added so the API can enqueue jobs for the worker; queue names now live in `@zenora/shared` so api/worker can't drift apart.
- `apps/worker`: `webhook-ingress` now has a real processor — loads the stored event, routes by source to `processInstagramPayload`/`processWhatsappPayload`, which upsert `Lead`/`LeadIdentity`/`Conversation`/`Message` (the "message store"). Identity merge is by `ig_scoped_id`/`wa_phone` on `LeadIdentity`, which is what gives Instagram→WhatsApp continuity (docs/PRD.md). Every inbound message resets the conversation's 24h window (CLAUDE.md rule #5).
- `apps/web`: `/settings` "Connect channels" page — real Instagram connect link (browser navigation to the API's OAuth-redirect endpoint) and a WhatsApp connect button wired to the Embedded Signup JS SDK flow (`lib/whatsapp-embedded-signup.ts`), gated behind `NEXT_PUBLIC_META_APP_ID`/`NEXT_PUBLIC_META_WHATSAPP_CONFIG_ID`.
- Tests: encryption round-trip + tamper detection, webhook signature guard (valid/tampered/missing), and worker message-store logic (lead identity reuse-vs-create, echo-skip, unconnected-account skip) — 20 tests total across the repo, all passing. Lint/typecheck/build all green.

**Not yet live-testable**
- Nothing here can be exercised end-to-end without a real Meta developer app (App Review, business verification, a WhatsApp Embedded Signup `config_id`) — see docs/INTEGRATIONS.md's "accounts to create" list. The code paths are structurally complete and unit-tested; live verification is on whoever sets up the Meta app.
- Comments/story-reply webhook events and the Instagram multi-account picker aren't handled yet — only DM `messaging` events and WhatsApp `messages` events, which is the Phase 1 item 1 scope.

**Next**
- Phase 1 item 2: unified inbox (realtime updates, 24h window UI, handover, quick replies, templates) — the `Conversation`/`Message` tables and window logic built here are what it reads from.
