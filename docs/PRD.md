# Zenora — Product requirements (all modules)

Screen references are file names in `design/screens/`.

## 1. Website, sign-up and auth
- Marketing site: home (`Landing`), pricing (`Pricing`), partner program link.
- Sign up with Google or email + mobile OTP (SMS or WhatsApp authentication template) (`SignUp`, `Verify`).
- Log in (password, Google, OTP), forgot/reset password (`Login`, `ForgotPassword`). Two-step login option, sign out other devices (`Profile`).

## 2. Onboarding (5 steps)
1. Business name, languages, mode (Team mode / Creator mode), industry (10 + "type your own") — loads a starter kit (`Onboarding`).
2. Connect channels: Instagram professional account, WhatsApp (Embedded Signup, own number), Meta Ads, Google Ads, calendar + meeting bot, telephony, payments, website widget/QR, webhooks/API (`Connect`).
3. Invite team with role and team (`InviteTeam`).
4. Pick a first bot from suggested templates (`PickBot`).
5. Go-live checklist incl. "add payment method in Meta" warning (`GoLive`).

## 3. Workspace shell
- Sidebar: workspace switcher (multi-workspace for partners), global search (Ctrl K), AI credits meter, nav, notifications, help, profile.
- Global search across leads, chats, calls/meetings, automations, settings (`GlobalSearch`).
- Notifications centre + channels (app, WhatsApp, email) per event type (`Notifications`, `Profile`).
- Empty, error, offline, disconnected-channel and loading states (`States`).

## 4. Home
- Team mode dashboard: new leads, qualified, median first-call time, appointments, won; leads by source; needs-attention list; speed-to-lead by salesperson; WhatsApp spend estimate (`Dashboard`).
- Creator mode home: reel/post automations with keyword, follow gate, DMs sent, link clicks; brand collab enquiries; course sales (`CreatorHome`).

## 5. Unified inbox (`Inbox`)
- Channels: Instagram DMs, comments, story replies/mentions, WhatsApp. Filters: mine, unassigned, bot active, waiting on us.
- One thread per lead across channels (Instagram → WhatsApp continuity).
- 24-hour window timer; outside the window only approved templates can be sent.
- Bot/human handover: bot pauses when a person replies; resume options.
- Composer: quick replies (/shortcut), attachments (media, document, location, contact, catalog product, saved media), template picker, payment link, AI suggested reply.
- Right panel: stage, owner, fields filled by bot, score, tags, AI summary, link to profile. Click-to-call.

## 6. Leads (CRM)
- Leads list with saved views, filters, search, bulk actions (assign, move stage, tag, add to sequence, send template, merge, delete with confirm) (`LeadsList`, `ConfirmDelete`).
- Add lead manually with duplicate check (`AddLead`); import CSV/Excel with column mapping, duplicate update, tag, routing (`ImportLeads`).
- Lead profile: fields, attribution (campaign/ad set/ad, bot), consent status, merged profiles, unified timeline (messages, bot steps, routing, calls with recording, meetings, stage changes, tasks, notes with @mentions), next steps, duplicate suggestion (`LeadProfile`).
- Merge duplicates field by field (`MergeLeads`).
- Leads board (Kanban): multiple pipelines, drag cards, stage rules shown on columns, filters (`Pipeline`).
- Moving to a stage with required fields opens a form; Won/Lost trigger their automations (`MoveStage`).

## 7. Automations
- List with folders, status (live/scheduled/draft/paused), runs, leads captured, actions (edit, stats, pause, duplicate, rename, move, save as template, delete) (`AutomationsList`).
- Creation flow: 1 choose type (12 types + custom trigger + my templates) → 2 set trigger → 3 build flow → 4 test and publish (`AutoNew`, `AutoTrigger`, `TriggerBuilder`, `Main`, `AutoPublish`).
- Trigger setup: pick posts/reels (specific/any/next), keywords (contains/exact/any), exclusions, keyword clash detection, public reply variations, follow gate, once per person, re-run on past comments, date limits, create lead.
- Custom trigger builder: any event (Instagram, WhatsApp, CRM, calls/calendar, payments/forms, schedule, date field, webhook/API) + AND/OR conditions on any field + limits (once per lead, working hours, delay); save to "My triggers".
- Flow builder blocks — Triggers; Send: text, reply buttons (max 3), list menu (max 10), image/video, document, link/payment link, WhatsApp Form (Flows), location request, product/catalog message, approved template, Instagram private reply; Logic/CRM: condition, wait, smart delay, randomize (A/B), save answer to field, tag/score, move stage, assign, notify, hand over to human, sync to ad audience; Instagram/AI: ask for follow, DM variations, AI answer from knowledge, AI lead score.
- Live preview (Instagram/WhatsApp) and Meta policy check (24h window, template category, comment reply limits).
- Test and publish: automated checks with fix links, test to own Instagram/WhatsApp (test runs don't create leads), schedule/end date, re-run existing comments, auto-pause if error rate > 5%.
- Automation stats: triggered, moved to WhatsApp, qualified, booked, handed over; step funnel; A/B winner; run log; version history with restore (`AutoDetail`).
- Flow templates: gallery (all, my templates, shared by agency, public), industry filter; template editor with fill-in variables `{business_name}`, steps, bundled stages/fields/WA templates, sharing scope; "Save as template" from any flow (`Templates`, `TemplateEditor`).

## 8. Messaging
- WhatsApp templates: list with category, language, buttons, Meta rate, approval status; template builder with header types, body variables, footer, buttons, preview, submit to Meta (`Broadcasts`, `TemplateCreate`).
- Broadcasts: template, audience filters, opted-in only, skip recently messaged, reply owner, schedule, cost estimate, send test.
- Quick replies with saved media and role access (`QuickReplies`).

## 9. AI
- AI knowledge base: sources (PDF, sheet, website sync, text), FAQs with usage counts, generate FAQs from sources; rules (answer only from sources, hand over when unsure or discount asked, always end with next step, reply in lead's language, share prices toggle); tone; languages; test chat with cited source (`Knowledge`).
- AI lead scoring, AI summaries (chat, call, meeting), suggested replies, talking points in dialer.

## 10. Qualification and routing (`Routing`)
- Rule-based score (points per condition) + AI intent bonus; "qualified when" builder.
- Ordered routing rules (by interest, language, budget, source, fallback least-busy / round-robin); team availability toggles.
- Speed rules: call within N minutes else reassign; escalate to manager after 2 reassigns; after-hours behaviour.
- Salesperson WhatsApp alert with summary, call button, SLA warning (`Handoff`).

## 11. Calls, meetings, calendar
- Dialer: queue, live controls (mute/hold/transfer/keypad), notes, call outcome + next step, AI talking points, masked numbers (`Dialer`).
- Call log, recording player, consent notice, transcript (Tamil/Hindi/English + translation), AI summary, extracted fields → "Apply to lead", auto tasks (`Calls`).
- Meeting notetaker for Google Meet/Zoom/Teams: summary, decisions, action items, draft follow-up (WhatsApp/email) for approval (`Meetings`).
- Calendar: week view, appointment types, availability, buffers, holidays, calendar sync, WhatsApp reminders, no-show follow-up (`Calendar`); public booking page (`BookingPage`).
- Tasks and follow-up sequences (`Tasks`). Mobile web "my leads" view for field sales (`MobileLead`).

## 12. Growth
- Ads and sources: campaign → leads → qualified → appointments → won, with spend and cost per qualified lead; organic sources; audience sync (Meta custom/lookalike, exclusions, retargeting, Google Customer Match, consent-only); capture settings (dedupe by phone, instant lead forms, ad tagging) (`Sources`).
- Link in bio page with WhatsApp CTA, booking, brochure, call-back form with consent (`LinkInBio`).
- Reports: funnel per pipeline, bot drop-off, team performance, lost reasons, CSV/Excel export, scheduled report (`Reports`).

## 13. Settings
- Team and roles (Owner, Admin, Manager, Sales, Viewer) with permission matrix (`Settings`); seat limit handling (`SeatLimit`).
- Channels (`Connect`); pipelines, stages, fields (`PipelineSettings`, `StageEdit`, `FieldEdit`); routing; quick replies; AI knowledge.
- Industry and labels: rename Lead/Appointment/Salesperson/Won/Pipeline/Interest; industry starter kits; currency, time zone, working hours (`Labels`).
- Privacy and data (DPDP): consent notices, recording announcements, retention periods, export/delete a lead's data, security options, data in India (`Privacy`).
- API keys and webhooks (`ApiWebhooks`); audit log (`AuditLog`); profile (`Profile`); help and support (`Help`).
- Usage and credits, top-up, credits-used-up state (`Usage`, `TopUp`, `LimitReached`).
- Billing and plan, add-ons, invoices, checkout with GST and coupon, payment success, downgrade/pause/cancel (`Billing`, `Checkout`, `PaymentSuccess`, `CancelPlan`).

## 14. Partners (no white label)
- Agency workspaces: manage multiple client workspaces from one login (`Agency`).
- Refer and earn: referral link/code, attribution window, referred businesses and status, commission [X]% for [N] months, monthly payouts against GST invoice (`Referral`). Placeholders to be decided by Rookiezz.

## 15. Owner console (Rookiezz internal)
- Workspaces, MRR, trials, churn, platform health (Meta webhooks, Cloud API, app review, transcription queue, payment gateway), support queue, partner commissions, "view as" (`SuperAdmin`).
- Usage and costs: AI provider spend, credits used, top-up revenue, cache hits, guardrail stops, margin by plan, editable plan limits and credit weights, workspaces to watch (cost > 30%, loops, free-plan abuse, upgrade candidates) (`SuperAdminUsage`).
