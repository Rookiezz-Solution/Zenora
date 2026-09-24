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
- Start Phase 1 item 1 (Meta app + webhooks ingress, Instagram connect, WhatsApp Embedded Signup) once Phase 0 is reviewed and approved.
