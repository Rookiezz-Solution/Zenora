# Zenora — project context for Claude Code

Zenora is a multi-tenant SaaS CRM, built by Rookiezz Solutions (Chennai), that turns Instagram and WhatsApp conversations into closed deals. It captures leads from reels, DMs, story replies, Meta lead forms and click-to-WhatsApp/DM ads, qualifies them with no-code bots, routes hot leads to a sales team, records and summarises calls and meetings, and tracks everything on customisable pipelines.

It is industry-generic: every business can customise its own pipelines, stages, fields, labels (Lead → Student/Patient…), automations, triggers and templates. Target market: Indian SMBs (coaching, clinics, salons, real estate, D2C, travel, creators, local services, agencies).

## Read these first
- `docs/PRD.md` — every module and feature (source of truth for scope)
- `docs/ARCHITECTURE.md` — stack, services, data model, background jobs
- `docs/INTEGRATIONS.md` — third-party APIs, what each is used for, costs
- `docs/PLANS_AND_LIMITS.md` — plans, AI credits, limits and enforcement rules
- `docs/ROADMAP.md` — build phases and the order to work in
- `design/SCREENS.md` + `design/screens/*.dc.html` — the approved UI for all 72 screens

## Non-negotiable product rules
1. Official Meta APIs only (Instagram Graph API Messaging, WhatsApp Cloud API as a Meta Tech Provider, Marketing API). No scraping, no unofficial WhatsApp libraries.
2. Customers connect their OWN WhatsApp number (Embedded Signup) and pay Meta directly for messages. Zenora never marks up or fronts WhatsApp charges. Same for telephony: customers bring their own provider account.
3. No white labelling and no reselling. Agencies/partners manage client workspaces and earn referral commission; clients always pay Zenora directly under the Zenora brand.
4. Never break a live bot. When AI credits run out, bots continue with buttons/menus/forms; only AI replies and summaries pause. Always keep capturing inbound leads even when other limits are hit.
5. Enforce Meta rules in the product: 24-hour customer service window, approved templates outside it, one private reply per Instagram comment, opt-in before marketing templates.
6. India first: INR pricing with GST invoices, data hosted in India, Tamil/Hindi/English and code-mixed (Tanglish/Hinglish) support, DPDP Act consent and deletion.
7. Every tenant's data is isolated by `workspace_id` on every query. Row-level checks in the API layer, plus Postgres RLS where practical.
8. Never store raw card numbers, bank account numbers or government IDs. Secrets only in environment variables / a secrets manager.

## Working agreement for Claude Code
- Work phase by phase from `docs/ROADMAP.md`. Before starting a phase, write a short plan and wait for approval.
- Keep a running `docs/PROGRESS.md`: what's done, what's next, open questions.
- Ask before adding a new third-party service or changing the stack.
- Write tests for business logic (automation engine, routing, credit metering, permissions). Aim for green CI before moving on.
- Use feature flags for anything half-built. Use test/sandbox keys only; never commit secrets (`.env.example` lists every variable).
- Match the UI in `design/screens` (layout, copy, fields, dropdown options). Brand colour #8B4FA8; fonts Bricolage Grotesque (headings) and Plus Jakarta Sans (body).
