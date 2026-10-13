# Working on Zenora as a team

The code lives in one GitHub repo (`Rookiezz-Solution/Zenora`). Everyone works on their own laptop and shares changes through it. Nothing is shared by copying folders.

## One-time setup (each developer)

1. **Get access.** The repo owner adds each developer: GitHub → repo → Settings → Collaborators (or give them a team in the organisation) with *Write* access.
2. **Install:** Git, Node 20+ (22 is fine), and pnpm (`npm i -g pnpm`).
3. **Clone and install:**
   ```bash
   git clone https://github.com/Rookiezz-Solution/Zenora.git
   cd Zenora
   pnpm install
   cp .env.example .env     # then fill it in, see below
   pnpm db:generate
   ```
4. **Your own `.env`.** It is never committed (it is in `.gitignore`) and holds secrets, so the two of you pass the values privately (a password manager, not chat/email). **Each developer should use their own database and Redis**, not the same ones:
   - Postgres: in Neon, create a **branch** of the dev database per developer (Neon → Branches), and use that branch's connection string.
   - Redis: a separate Upstash database each, or a local Redis.
   - `AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` can differ per developer (they only protect that developer's own data).
   Sharing one database means you overwrite each other's test data and collide on migrations.
5. **Create the tables:** `pnpm db:migrate:deploy`, then run it: see `README.md` / `docs/DEPLOYMENT.md`.

## Daily workflow

```bash
git checkout main && git pull          # start from the latest shared code
git checkout -b feature/short-name     # one branch per piece of work
# ...work, then check it...
pnpm typecheck && pnpm lint && pnpm test
git add -A && git commit -m "What and why"
git push -u origin feature/short-name
```

Then on GitHub open a **Pull Request** into `main`. The other developer reviews it, CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and build, and it is merged when green. After a merge everyone runs `git checkout main && git pull` and `pnpm install` (if `package.json`/lockfile changed) to get it. **Do not commit straight to `main`** and **never force-push `main`**.

Keep branches short-lived (a day or two) and pull `main` into yours often (`git pull origin main`), so conflicts stay small.

## Things that need care with two people

- **Database migrations** (`packages/db/prisma/migrations`): if both of you change `schema.prisma` at once you will have two migrations touching the same tables. Tell each other before changing the schema; merge one first, then the other developer pulls it, runs `pnpm db:migrate:deploy`, and re-creates their migration if it now conflicts. Migrations are forward-only; never edit one that has been merged.
- **`pnpm-lock.yaml`**: if it conflicts, take `main`'s version, run `pnpm install`, and commit the result. Never hand-edit it.
- **Secrets**: never commit `.env`, keys or tokens. If one is committed by mistake, tell the owner: it must be rotated, not just deleted.
- **Shared packages**: `packages/shared` and `packages/db` are consumed from their built `dist`. After pulling changes there, run `pnpm build` (or `pnpm --filter @zenora/shared build`) before running tests or the apps.
- **Decisions and progress** are logged newest-first in `docs/PROGRESS.md`; add an entry for notable changes.

## Recommended GitHub settings (repo owner, once)

Settings → Branches → add a rule for `main`: require a pull request before merging, require the CI check to pass, and block force pushes.
