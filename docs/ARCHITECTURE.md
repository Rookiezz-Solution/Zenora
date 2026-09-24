# Zenora — Architecture (recommended; confirm before building)

## Stack
- Monorepo: pnpm + Turborepo, TypeScript everywhere.
- `apps/web`: Next.js (App Router) + React + Tailwind + shadcn/ui. Flow builder canvas with React Flow.
- `apps/api`: NestJS (or Fastify) REST API + WebSocket gateway for live inbox.
- `apps/worker`: BullMQ workers (automation engine, webhooks, AI, transcription, broadcasts, billing jobs).
- `apps/booking`: public pages (link in bio, booking page) — can live inside `web` as public routes.
- Database: PostgreSQL 16 (managed) + Prisma, pgvector for knowledge search.
- Cache/queues: Redis. Object storage: S3-compatible (recordings, media, uploads).
- Hosting: AWS ap-south-1 (Mumbai) or equivalent Indian region. Sentry, OpenTelemetry logs.
- Auth: email/password + Google OAuth + OTP; sessions via httpOnly cookies; RBAC per workspace.

## Core data model (tables)
workspaces, users, memberships (role, teams), teams, invites
channels (instagram_accounts, whatsapp_numbers, ad_accounts, calendars, telephony_accounts) with encrypted tokens
contacts/leads, lead_identities (ig id, wa phone, email for merging), lead_field_values, tags, lead_tags, notes, consents
pipelines, stages (type open/won/lost, required fields, on-enter automations, SLA), custom_fields, labels (terminology)
conversations, messages (channel, direction, window_expires_at, template_id, status)
automations, automation_versions (JSON graph), triggers, saved_triggers, automation_runs, run_steps, flow_templates
wa_templates (category, language, status), broadcasts, broadcast_recipients, quick_replies, media
routing_rules, scoring_rules, assignments, sla_timers
calls (recording_url, transcript, summary, consent_played), meetings, appointments, appointment_types, availability, booking_pages
tasks, sequences, sequence_enrollments
knowledge_sources, kb_chunks (vector), faqs, ai_settings
plans, subscriptions, invoices, addons, credit_ledger, usage_events, usage_monthly
partners, referrals, commissions, payouts
api_keys, webhooks, webhook_deliveries, audit_logs, notifications, feature_flags

## Key services
- Webhook ingress: verify Meta signatures, store raw event, enqueue; idempotent by event id.
- Automation engine: event → matching triggers (priority + clash rules) → run graph step by step with durable state, waits/delays via delayed jobs, Meta policy guard before every send.
- Routing service: score → qualify → pick owner by ordered rules → start SLA timer → reassign/escalate.
- Messaging service: unified send API for Instagram and WhatsApp, 24h window checks, template fallback, rate limits.
- AI service: model routing (cheap model for replies/scoring, stronger for summaries), prompt caching, answer cache for repeated FAQs, per-workspace credit check before every call, guardrails (max replies per chat, min call length).
- Speech: transcription with speaker labels + translation; meeting bot provider webhooks.
- Metering: every AI action writes a usage_event and debits credit_ledger atomically; alerts at 50/80/100%.
- Billing: subscription + UPI AutoPay via payment gateway, GST invoices, proration, top-ups, dunning.
