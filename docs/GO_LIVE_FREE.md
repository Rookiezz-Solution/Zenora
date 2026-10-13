# Go live for free (testing/demo): Vercel + Render + Neon + Upstash

Layout: **web app on Vercel**, **API and worker on Render (free)**, **Postgres on Neon**, **Redis on Upstash**. All free. This is for **testing and demos**, not real customers or real payments (see "Limits" at the end).

```
Browser ──► Vercel (web app, apps/web)
   │
   └──────► Render: zenora-api  ──► Neon (Postgres)
            Render: zenora-worker ─► Upstash (Redis)
```

The files already in the repo: `render.yaml` (API + worker), `apps/web/vercel.json` (web build settings), `docs/RENDER.md` (more detail on Render). Do the steps **in this order**, because the API and the web app need each other's addresses.

## 0. Things to have ready
- GitHub repo `Rookiezz-Solution/Zenora` (push access; Render and Vercel need to be allowed to read it).
- Accounts: Render, Vercel, Neon, Upstash (all free).
- A **new** Neon project and a **new** Upstash database just for testing (do not reuse your development ones).
- A secret key: generate 64 hex characters. In PowerShell:
  `-join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })`
  Save it in a password manager. **Losing it makes stored tokens unreadable.** Never put it in the repo or in chat.

## 1. Neon (database)
New project → Connect → copy the **pooled** connection string (the host contains `-pooler`). This is `DATABASE_URL`.

## 2. Upstash (Redis)
Create a Redis database → copy the connection URL that starts with `rediss://`. This is `REDIS_URL`.

## 3. Render (API + worker)
1. Render → **New → Blueprint** → choose the Zenora repo.
2. It proposes two services (`zenora-api`, `zenora-worker`) and a group `zenora-shared`. When asked for the values, fill in:
   - `DATABASE_URL`: from step 1
   - `REDIS_URL`: from step 2
   - `TOKEN_ENCRYPTION_KEY`: the key from step 0
   - `SUPER_ADMIN_EMAILS`: your email (lets you open `/admin`)
   - `APP_URL`: put `https://placeholder.vercel.app` for now (you fix it in step 5)
3. **Apply**. The first build takes several minutes; the API build also creates the database tables.
4. Open each service in Render and note its real address. If the API is not `https://zenora-api.onrender.com`, set `API_URL` on the API service to the real address.
5. Check `https://<your-api>/health/ready`: it should show `database: up` and `redis: up`.

## 4. Vercel (web app)
1. Vercel → **Add New → Project** → import the Zenora repo.
2. **Root Directory:** `apps/web`, and tick **Include source files outside of the Root Directory**. (The install and build commands come from `apps/web/vercel.json`; leave them.)
3. **Environment Variables:** add `NEXT_PUBLIC_API_URL` = your Render API address (no trailing slash). Optional: `NEXT_PUBLIC_SUPPORT_EMAIL`.
4. **Deploy**. Note the address Vercel gives, e.g. `https://zenora-xyz.vercel.app`.

## 5. Connect them
On Render, open `zenora-api` → Environment → set `APP_URL` to the **Vercel address** (exactly, https, no trailing slash) → save (it redeploys). The API only accepts browser requests from this address, so the web app cannot log in until you do this.

## 6. Try it
Open the Vercel address → **Start free** → sign up → click through. If login does not stick, see "Limits" (cookies).

## What to expect / limits
- **Sleeping:** Render's free services sleep after ~15 minutes without traffic. The first request after a pause waits 30–60 seconds, and the **worker sleeps too**, so reminders, the daily trial/credit sweep, ad sync and queued webhooks pause until something wakes it.
- **Hours:** Render gives a limited number of free instance hours per month shared by your free services.
- **Build memory:** free builds are small; if one fails with out-of-memory, retry.
- **Cookies:** the web app (Vercel) and API (Render) are on different sites, so the login cookie is `SameSite=None; Secure` (already set). Chrome, Edge and Firefox allow it; **Safari and some privacy settings block it**, so login may fail there. A custom domain with `app.` and `api.` subdomains fixes this.
- **Vercel Hobby is for non-commercial use only.**
- Neon and Upstash free tiers are small. **Upstash's free command allowance may run out** because the job queue polls Redis; if the worker starts failing with Redis limit errors, that is why.
- **Do not use this for real customers or real payments.** Use Razorpay *test* mode only, and no real customer data.

## Next (when you are ready for more)
Email (Admin → Integrations → Email), Meta/Google/Razorpay/Anthropic keys (Admin → Integrations), then a custom domain and paid instances: see `docs/DEPLOYMENT.md`.
