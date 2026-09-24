# Zenora

Multi-tenant SaaS CRM that turns Instagram and WhatsApp conversations into closed deals. See `CLAUDE.md` for the product brief and non-negotiable rules, `docs/` for the PRD/architecture/roadmap, and `design/` for the reference screens.

Clickable design: https://claude.ai/artifact/CWN39QTMKSK1eqAZ97dSSq

## Getting started

Requires Node 20+, pnpm, a local PostgreSQL 16 and Redis (or point `DATABASE_URL`/`REDIS_URL` at hosted ones).

```bash
cp .env.example .env   # fill in DATABASE_URL, AUTH_SECRET at minimum
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev                # runs web (:3000), api (:4000), worker together
```

## Monorepo layout

- `apps/web` — Next.js app (marketing, auth, product, public booking/link-in-bio routes)
- `apps/api` — NestJS REST API (auth, RBAC, workspaces, ...)
- `apps/worker` — BullMQ background workers (automation engine, webhooks, AI, ...)
- `packages/db` — Prisma schema, client, migrations, seed
- `packages/shared` — types, RBAC matrix, plan limits, feature flags shared across apps
- `packages/config` — shared tsconfig/eslint base config

See `docs/ROADMAP.md` for build phases and `docs/PROGRESS.md` for what's done and what's next.
