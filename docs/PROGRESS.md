# Zenora — build progress

## 2026-09-25 — Phase 1 item 8: Routing, scoring, SLA reassign, salesperson WhatsApp alerts; tasks and sequences

**Scope decision**: docs/PRD.md's full spec bundles a few things Phase 2 territory needs first — "AI intent bonus" scoring needs the AI service, and a tappable "call" button on the salesperson alert needs a WhatsApp interactive message type, not plain text. This pass scopes to: rule-based scoring only (points per condition), ordered routing rules (source/tag/custom-field conditions → user/team/least-busy/round-robin), a workspace-level speed rule with automatic reassign-then-escalate, a plain-text WhatsApp alert, and tasks + linear follow-up sequences. Logged here rather than silently narrowed, same as prior items.

**Done**
- `packages/db`: `Workspace.slaMinutes` (speed-rule default) and `Membership.available` (team availability toggle) added — `RoutingRule`, `ScoringRule`, `Assignment`, `SlaTimer`, `Task`, `Sequence`, `SequenceEnrollment` were already scaffolded in the Phase 0 schema and needed no changes beyond a `BroadcastRecipient`-style `lead` relation gap that didn't apply here. Two migrations applied live on Neon.
- `packages/shared`: `routing.ts` — pure, DB-free matching logic (`matchesCondition`, `computeScore`, `matchRoutingRule`, `pickLeastBusy`, `pickRoundRobin`) shared by both the API and worker's routing engines so the actual selection algorithm can't drift between the two duplicated DB-touching wrappers; `sequences.ts` — the `SequenceStep`/`SequenceAction` contract (send_text/tag/create_task). `routing`/`sequences` added to `QUEUE_NAMES`; new `routing.manage`/`tasks.manage` permissions (manager+ for routing config, sales+ for tasks).
- `apps/api` `routing` module: CRUD for routing/scoring rules (ordered, reorderable) plus `RoutingEngineService.applyToNewLead` — scores the lead, matches routing rules or falls back to least-busy among *available* members, creates the `Assignment`, starts an `SlaTimer` off `workspace.slaMinutes`, and queues the salesperson alert; wrapped in try/catch so a routing hiccup never blocks lead creation. Hooked into `LeadsService.create`. `InboxService.sendMessage` now resolves any open `SlaTimer` for the lead on a human outbound reply — a bot send doesn't count, only a person actually responding does.
- `apps/api` `tasks` and `sequences` modules: task CRUD with assignee/lead/completed filters; sequence CRUD plus `enroll` (dedupes against already-active enrollments, queues the first step delayed by its `waitHours`) and `stop`.
- `apps/worker`: `processors/routing.ts` — the worker-side twin of the API's routing engine (same duplication reason as `meta-send.ts`/`decrypt-token.ts`: no Nest DI for the webhook-created-lead path), plus `processSlaCheck` (reassigns to another available member excluding the current owner, up to 2 reassigns, then escalates to a manager — falling back to the owner role if no manager membership exists — and stops scheduling further checks once escalated) and `processSalespersonAlert` (plain-text WhatsApp summary to the assignee's own phone via the workspace's connected number). `processors/sequence.ts` — advances one lead through a sequence's steps, self-chaining a delayed job for the next step exactly like the automation engine's `wait` block; a failed send is logged and still advances the step rather than stalling the sequence. `findOrCreateLeadByIdentity` now runs `applyToNewLead` for genuinely new leads only (not ones matched to an existing identity).
- `apps/web`: `/settings/routing` (speed rule, team availability toggles, scoring rules, ordered routing rules with a shared condition-builder component and up/down reordering); `/tasks` (add/complete/filter) linking to `/tasks/sequences` (list/create/detail with a per-lead enrollment list and a stop action); the lead profile page gained a "Follow-up sequence" enroll control. New `routing.manage` gate gets its own settings tab.
- Tests: 10 for the shared pure routing functions, 6 for the API's `RoutingEngineService` (score computation, least-busy fallback, SLA timer + alert queuing, graceful no-op with no available member, error-swallowing), 5 for tasks, 4 for sequences (enroll dedup, delay-by-waitHours, stop), 9 for the worker's routing processor (assign, reassign excluding the current owner, escalate with/without a manager membership, alert send/skip paths), 5 for the worker's sequence processor (advance, complete, defensive over-index, a failed send still advancing) — 39 new tests, 159 total across the repo. Full `pnpm typecheck`/`lint`/`test`/`build` all green.

**Verified live**: created a real account + workspace through signup; built a scoring rule and a routing rule through the settings UI and confirmed both rendered correctly; created a lead via the API with a source matching both rules and confirmed live that its score became 10 and it was auto-assigned to the only available member, with a real `Assignment` and `SlaTimer` row created; confirmed via worker logs that the queued `salesperson_alert` job was consumed and correctly skipped with a graceful warning (the test account has no phone on file, expected in this dev environment); manually fired the delayed `sla_check` job against the live timer and confirmed it correctly logged "no other available member to reassign to" (only one member existed, already the owner) rather than reassigning incorrectly; created a task through the UI, marked it complete, and confirmed the completed/incomplete filter toggle works; created a sequence through the UI, confirmed its stored steps via a direct API call, enrolled the test lead from its profile page, confirmed the enrollment appeared on the sequence's detail page at "step 1/1 · active", then stopped it and confirmed the status flipped to "stopped". Deleted all test data (workspace, user, lead, task, sequence) afterward.

**Simplifications / follow-ups**
- No AI intent bonus in scoring (Phase 2 — needs the AI service); no interactive "call" button on the salesperson alert (needs a WhatsApp interactive message type, not plain text — noted inline in `routing.ts`).
- Round-robin is approximated with an assignment-count modulo over a deterministically-sorted candidate list rather than a stored rotation pointer — good enough for a fair-ish spread without extra state, but not a strict rotation.
- "Team" as a routing target scopes candidates by `teamId`, but there's no team-management UI yet (Team the model already existed from Phase 0) — the routing settings UI only exposes "specific person," "least busy," and "round robin," not a team picker.
- No bulk multi-select "add to sequence" from the leads list (docs/PRD.md mentions this as a leads-list bulk action) — only a single-lead enroll from the lead profile page, to keep this item bounded. The leads list itself has no bulk-select UI yet at all, which predates this item.
- Nothing here can be tested against a real WhatsApp salesperson alert without a real Meta app and a verified staff phone number — same standing caveat as every Meta-integration item so far.

**Next**
- Phase 1 item 9: Plans, billing (gateway, GST invoices), limits and usage metering (without AI yet), onboarding flow. Last item before Phase 1's pilot-ready MVP is complete.

## 2026-09-25 — Phase 1 item 7: WhatsApp template builder + Meta approval sync; basic broadcasts

**Done**
- `packages/db`: `WaTemplate` gained header/footer/buttons/Meta-status fields (`headerType`, `headerText`, `footerText`, `metaTemplateId`, `rejectionReason`, `submittedAt`); new `Broadcast` (audience filter, schedule, cost estimate, status) and `BroadcastRecipient` (per-lead send status, with a real `lead` relation added in a follow-up migration once a schema gap surfaced during typecheck — see below) models; `Broadcast.sentAt`. Two migrations applied live on Neon.
- `packages/shared`: `WHATSAPP_MESSAGE_COST_PAISE` — the India per-message rates Meta bills directly (marketing 86p, utility/authentication 12p), from docs/INTEGRATIONS.md, used for broadcast cost estimates.
- `apps/api` `MetaGraphClient`: `submitWhatsappTemplate` (builds Meta's HEADER/BODY/FOOTER/BUTTONS `components` array, POSTs to `/{waba-id}/message_templates`) and `getWhatsappTemplateStatus` (manual approval-status poll).
- `apps/api` `templates` module (rewritten from Phase 1 item 2's inline controller into a real service): full CRUD with Meta's naming rules enforced (lowercase snake_case) via a `z.discriminatedUnion`'d buttons schema; `submit`/`sync` endpoints; edits and deletes are refused with a 409 once a template has been submitted to Meta (`submittedAt` set) — Meta reviews the version it received, so we can't let it drift locally.
- `apps/api` `broadcasts` module (new): audience resolution as a composable filter pipeline (tag → marketing opt-in consent → skip-recently-messaged-hours, each narrowing the previous set, short-circuiting to empty if there's no WhatsApp-identity base); cost estimation off the template's category rate × resolved audience size; `create` refuses a non-approved template; `send` materializes `BroadcastRecipient` rows in a transaction, sets status to `scheduled` or `sending` depending on `scheduledAt`, and enqueues a `broadcasts` queue job (delayed for scheduled sends via a new `delayMs` param on `QueueService.add`); `sendTest` delivers to one lead directly without touching the recipient list (test runs don't count, per docs/PRD.md).
- `apps/worker`: `processTemplateStatusUpdate` in `whatsapp.ts` handles Meta's `message_template_status_update` webhook field — looks up the template by `metaTemplateId`, updates `metaStatus`/`rejectionReason` — so approval sync works passively via webhook, not just the manual `sync` poll. New `processors/broadcast.ts` — the piece that was missing when this item's backend was first written and caught before commit: `QueueService.add("broadcasts", "send", ...)` was enqueuing into a queue with no real processor, silently falling through to the worker's placeholder logger. `processBroadcast` now loads the broadcast's pending recipients, sends each via a new `sendWhatsappTemplate` (added to the worker's standalone `meta-send.ts`, mirroring the API client's version), writes an outbound `Message` + publishes a realtime inbox event per send, marks each recipient `sent`/`skipped`/`failed` independently (one bad send doesn't abort the batch), and marks the broadcast `sent` when done (or `failed` outright if the workspace has no connected WhatsApp number).
- `apps/web`: `/broadcasts` (list with status badges), `/broadcasts/templates` + `/templates/new` + `/templates/[id]` (shared `TemplateBuilderForm` component — header/body/footer/buttons editor; the detail page locks the name and swaps to a read-only summary once submitted, since the backend refuses edits past that point), `/broadcasts/new` (template picker, audience filter controls with a live debounced cost/audience estimate against the real `estimate` endpoint, optional scheduling), `/broadcasts/[id]` (cost/recipient summary, send-test lead picker, send/schedule action, per-recipient status list). Sidebar's existing "Broadcasts and templates" link now resolves to a real page.
- Tests: 6 for the templates service (duplicate-name rejection, submit/edit-lock behavior), 9 for the broadcasts service (audience filter pipeline, cost calc, send/schedule/refusal paths), 4 for the worker webhook template-status sync, 4 for the new broadcast processor (send-all, skip-no-identity, one-failure-doesn't-abort-the-rest, no-whatsapp-number-fails-the-whole-broadcast) — 23 new tests, 120 total across the repo. Full `pnpm typecheck`/`lint`/`test`/`build` all green.

**Bug caught before commit**: `BroadcastsService.getById`'s `include: { recipients: { include: { lead: true } } }` referenced a `lead` relation that didn't exist on `BroadcastRecipient` yet — Prisma's payload-type inference failed on the whole query (not just that field), which also silently dropped `template` from the inferred return type and broke `sendTest`/`send`'s use of `broadcast.template.name`. Fixed by adding the actual `lead`/`broadcastRecipients` relation to the schema and migrating, rather than removing the include — the broadcast detail page needs recipient names.

**Verified live**: created a real account + workspace through signup, built a WhatsApp template through the UI and confirmed its exact stored fields via the API; force-approved it directly in Postgres (no real Meta dev app to submit to yet, same caveat as items 1/5) to exercise the rest of the pipeline; created a broadcast and watched the live audience/cost estimate update ("1 leads match — ₹0.86 estimated cost") against a seeded test lead with a `wa_phone` identity + marketing consent; `POST .../test` correctly 400'd with "No connected WhatsApp number for this workspace" (no real WhatsApp number connected in this dev environment); `POST .../send` correctly materialized a recipient row and flipped status to `sending`; confirmed via worker logs and a direct API re-fetch that the newly-registered `broadcasts` queue processor picked the job up and transitioned the broadcast to `failed` (no connected WhatsApp number) — proving the previously-missing worker processor is wired end-to-end, not just present in code. Deleted all test data (workspace, user, lead, template, broadcast) afterward.

**Simplifications / follow-ups**
- Nothing here can be tested against real Meta template review or real WhatsApp delivery without an actual Meta developer app + verified WABA — same standing caveat as every Meta-integration item so far. The submit/sync/webhook-sync code paths are structurally complete and unit-tested; live verification of the Meta side is on whoever sets up the Meta app.
- Broadcast audience targeting is tag + opt-in + recency only (docs/PRD.md's fuller segment builder — score ranges, stage, source — is a later refinement).
- No retry/backoff for individual failed recipient sends within a broadcast; a `failed` recipient just stays failed. Re-sending to failures specifically is a reasonable follow-up once broadcasts see real usage.
- No UI for the recipient's live status while `sending` (the detail page doesn't poll) — has to be manually refreshed to see progress.

**Next**
- Phase 1 item 8: Routing, scoring, SLA reassign, salesperson WhatsApp alerts; tasks and sequences.

## 2026-09-25 — Phase 1 item 6: Flow templates (starter kits for 4 industries), template editor, save as template

**Done**
- `packages/shared`: `substituteTemplateVariables`/`extractTemplateVariables` — pure functions that fill (or find) `{business_name}`-style placeholders in a graph's message text only, leaving block wiring (`next`/`tagName`/`stageId`/...) untouched.
- `apps/api` `flow-templates` module: gallery listing (`all`/`mine`/`public` scope + industry filter — `FlowTemplate.workspaceId: null` is how a template counts as "public"), CRUD scoped so a workspace can only edit/delete its own templates (a 403 on a public one, not a silent no-op), and a `use` endpoint that creates a brand-new `Automation` + initial version from the template's graph with `{business_name}` filled in from the workspace's actual name.
- `automations` module gained `POST :id/save-as-template`, capturing the automation's current draft graph as a new private `FlowTemplate` — docs/PRD.md's "Save as template from any flow."
- `packages/db` seed: 4 public starter-kit templates (coaching, clinic, salon, real_estate), each a realistic 3-block welcome → tag → handover flow using `{business_name}`.
- `apps/web`: `/automations/templates` (gallery with scope/industry filters, "Use template" prompting for a name and jumping straight to the new automation's editor) and `/automations/templates/[id]` (editor reusing the same `FlowBlockEditor` component the automation editor uses — a public template opens read-only), plus a "Save as template" button on the automation editor and a "Browse templates" link from the automations list.
- Tests: 6 for variable substitution/extraction, 4 for the flow-templates service (ownership guards on update/delete, the `use` → substitution wiring) — 10 new tests, 90 total across the repo.

**Verified live**: confirmed all 4 seeded starter kits show up in the gallery with their industry/public badges; called `use` on the coaching template and confirmed via the API that `{business_name}` became the workspace's real name ("Demo Business (Live)") in the new automation's first message; confirmed a direct `PATCH` on a public template is rejected with 403 rather than silently succeeding; opened the new automation's editor and confirmed the 3-block flow (with the filled-in text) reconstructed correctly from the stored graph.

**Simplifications / follow-ups**
- No "shared by agency" gallery scope — agencies don't exist until Phase 3, so the gallery only has `all`/`mine`/`public`, one short of the PRD's four.
- Templates don't bundle stages/custom fields/WA templates alongside the flow graph (docs/PRD.md mentions this) — only the flow itself. Worth revisiting once template authors actually need to ship a stage/field setup with their flow.
- `variables` on `FlowTemplate` is informational only (what the seed data declares) — nothing yet auto-populates it from a graph's actual placeholders via `extractTemplateVariables`, though the function exists and is tested for exactly that purpose.

**Next**
- Phase 1 item 7: WhatsApp template builder + Meta approval sync; basic broadcasts.

## 2026-09-25 — Phase 1 item 5: Automation engine + flow builder (core blocks), trigger setup, test and publish, stats, versioning

**Scope decision**: docs/PRD.md's full automation spec (12+ trigger types, AI blocks, catalog/payment/WhatsApp-Flows blocks, A/B testing, a visual canvas, a template gallery) is Phase 2+/later-Phase-1 territory — AI blocks specifically need Phase 2's AI service. docs/ROADMAP.md's Phase 1 item 5 only asks for "core blocks," so this pass scopes to: two trigger types (Instagram DM / WhatsApp message, keyword-matched), 8 core flow blocks, versioning, publish validation, dry-run testing, and stats. Logged here rather than silently narrowed, same as prior items' simplifications.

**Done**
- `packages/shared`: the flow graph/block contract (`automation.ts`) — 8 block types (send_text, send_quick_replies, condition, wait, tag, move_stage, assign, handover), each pointing directly at its next block id(s) rather than a separate edge list — and a pure `validateFlowGraph` (dangling references, quick-reply option count) used by both the publish-time check and (indirectly) the test-run path.
- `apps/api` `automations` module: full CRUD, duplicate, draft autosave (mutates the current version in place while unpublished; starts a new version once the current one is published — so publishing never rewrites history), trigger set (keyword list + contains/exact/any), publish (requires a trigger + a structurally valid graph), pause/resume, version history + restore-as-new-version, stats (run counts by status, a step funnel grouped by block, recent runs), and a dry-run test endpoint that walks the graph and logs the *intended* action at each block without touching a real lead or calling the Graph API (we have no real Meta app to test against, same caveat as items 1–2).
- `apps/worker` automation engine (`automation-engine/`): `trigger-matcher.ts` checks every live automation's keyword trigger against an inbound message (skipping automations that already have a run in progress for that lead); `engine.ts` walks the graph for real — sends messages through the same Graph API paths as the inbox, tags/moves-stage/assigns/hands-over by writing directly to Postgres, branches on `condition` by reading the lead's tags/stage/score, and suspends at `wait` blocks by scheduling a delayed BullMQ job rather than blocking the worker, resuming from the saved block id when it fires. Hooked into `processInstagramPayload`/`processWhatsappPayload` right after each stores a message — but only when the conversation's bot is still active, so a run never starts once a human has taken over.
- `apps/worker` also gets small duplicates of the API's `decryptToken` and the two Graph-API send calls (`meta-send.ts`) — the worker has no Nest DI to inject the API's versions with, and pulling Nest-shaped code in for ~40 lines wasn't worth the coupling. Flagged in each file's header comment so they're found if the cipher or send payloads ever change.
- `apps/web`: `/automations` (list + create) and `/automations/[id]` (trigger editor; a list-based flow block editor — not a drag-drop canvas, given "core blocks" scope — where every block with an outgoing edge gets an explicit "then go to" dropdown so blocks can be reordered or removed without silently breaking jumps; Build/Test/Versions/Stats tabs).
- Tests: 7 for graph validation, 8 for the automations service (draft-versioning branch logic, publish's trigger/graph checks, the test-run walk), 7 for the engine (linear execution, wait suspension, condition branching, error handling, resume), 5 for trigger matching (contains/exact/any, unpublished automations excluded, already-running automations skipped) — 27 new tests, 97 total across the repo.

**Verified live**: built a real automation in the UI (WhatsApp trigger on "price"/"cost", a send-message block wired to a handover block), published it, then POSTed a real inbound WhatsApp webhook with the trigger keyword — confirmed via the DB that a lead was created, the trigger matched, a run started, and the engine attempted the real Graph API send, failing cleanly on the placeholder token (expected — no real Meta app configured) with the error captured in a `RunStep` and the run marked `failed`, not crashed. The Stats tab showed that failure and its step funnel correctly. The dry-run Test tab (no real send attempted) walked the same graph successfully and displayed the intended message and handover.

**Simplifications / follow-ups**
- `send_quick_replies` sends its options as a numbered list in plain text — real interactive buttons need WhatsApp's "interactive" message type and Instagram's quick-reply API, neither wired up yet. The engine also just picks the first option to keep advancing in test mode; real option-based branching only takes effect once the lead's actual reply is matched back to an option, which isn't built (would need the inbox message handler to check for an active automation run waiting on a reply).
- `move_stage` inside a flow doesn't enforce a stage's `requiredFieldIds` the way the pipeline board's manual move does — an automation can move a lead into a gated stage without those fields set. Worth reconciling once this is used for real.
- No template gallery, no A/B testing, no custom trigger builder (any event + AND/OR conditions) — PRD scope beyond "core blocks."
- The flow editor's block list is ordered by following the first block's `next` pointer for display, which is a best-effort reconstruction — a graph with multiple disconnected branches (e.g. two different condition outcomes that never converge) will still show every block, just not in a single obvious reading order.

**Next**
- Phase 1 item 6: Flow templates (starter kits for 4 industries), template editor, save as template.

## 2026-09-25 — Phase 1 item 4: Pipelines (board, stages, custom fields, stage rules, move-stage form, labels/terminology)

**Done**
- `apps/api` `pipelines` module: pipeline CRUD, stage CRUD (with `requiredFieldIds`/`slaMinutes`), stage reordering, and a board endpoint (pipeline → stages → leads, excluding merged leads).
- `apps/api` `custom-fields` module: CRUD for `CustomField` (text/number/date/select/multiselect/boolean, `required` flag, unique key per workspace).
- `LeadsService.moveStage`: validates the target stage's `requiredFieldIds` are all present (blank string counts as missing, matching the DTO fix from item 3) before moving; on success it updates `stageId`/`pipelineId` and upserts the provided `LeadFieldValue`s in one transaction; logs a distinguishable audit action (`lead.marked_won`/`lead.marked_lost`/`lead.stage_changed`) so the automation engine (item 5) has something to hook into for "Won/Lost trigger their automations" once it exists.
- `WorkspacesService`/`Controller` gained `GET/PATCH /workspaces/:workspaceId` for name/currency/timezone and a partial-merge update to `Workspace.labels` (docs/PRD.md: rename Lead/Appointment/Salesperson/Won/Pipeline/Interest).
- `apps/web`: `/pipeline` — a real Kanban board (native HTML5 drag-and-drop, no library) with an inline add-stage form; dropping a card on a stage with required fields opens a modal (`MoveStageForm`) instead of failing silently. `/settings/fields` (custom field CRUD) and `/settings/labels` (terminology + currency/timezone), both behind a new shared `SettingsTabs` nav alongside the existing Connect-channels page.
- Extended `apiFetch`'s thrown error to carry the full response body (`ApiError.body`), not just `message`/`status` — needed so the pipeline board can read `missingFields` off a 409 and open the right modal.
- Tests: 3 for stage ordering (`addStage` appends after the current max, `reorderStages` sets order by list index, scoped to the pipeline) + 4 for `moveStage` (blocks on missing/blank required fields, names them, moves and saves field values once satisfied, logs the right audit action per stage type) — 39 tests total, all passing.

**Real bug found and fixed while testing live**: the 409 thrown when required fields are missing only returned `{id, label}` per field, not `type`/`options` — so the frontend's move-stage modal could never have rendered a proper `<select>` for an enum field or a date input; everything would have silently fallen back to plain text. Caught this by re-reading what `MoveStageForm` actually needed before wiring it up, not by a runtime failure — fixed by returning the full `CustomField` records from the service instead of a hand-picked subset. Also removed an unused `customFields` fetch in the board page that lint caught (a leftover from before this fix).

**Verified live**: created a pipeline (via the page's auto-create-if-none fallback), added stages via the UI, added a `required` custom field and a `won`-type stage via the API, created a lead and moved it into the required-fields stage — first confirming the 409 correctly names the field with its full type, then confirming a move with the field value provided succeeds and the card lands in the right column on reload. Also renamed "Lead" → "Student" via Settings → Industry and labels and confirmed it persisted in `Workspace.labels`.

**Simplifications / follow-ups**
- Drag-and-drop itself couldn't be exercised by browser automation (HTML5 DnD needs native drag events, not simulated mouse movement) — verified the underlying `onDrop`/`moveLead` wiring by code review and by driving the same API calls it makes directly instead.
- No pipeline switcher yet if a workspace has more than one pipeline (the board always shows the first) — fine while every workspace has exactly one pipeline; a switcher is a follow-up once multi-pipeline businesses need it.
- Stage deletion has no explicit "what happens to its leads" UI, but it's safe by default: `Lead.stageId` is optional with no `onDelete` override, so Prisma's default `SetNull` referential action means deleting a stage just clears `stageId` on its leads rather than deleting or orphaning them.
- Won/Lost automations are a logged no-op until the automation engine (item 5) exists, as called out above.

**Next**
- Phase 1 item 5: Automation engine + flow builder (core blocks), trigger setup, test and publish, stats, versioning.

## 2026-09-25 — Phase 1 item 3: Leads (list, profile, timeline, add/import, dedupe/merge, tags, notes)

**Done**
- `apps/api` `leads` module: list (search by name/phone/email, filter by tag), profile (identities, tags, notes, consents, field values), add with duplicate check (409 + the existing lead if phone/email already exists), update, delete, tag add/remove, notes, a unified timeline (merges notes + messages + tasks chronologically — bot steps/routing/calls/meetings will join once those phases exist), duplicate suggestions (shared phone/email), and merge (moves identities/notes/conversations/tasks onto the primary lead, re-points tags via upsert so it can't violate the (leadId, tagId) key, keeps the primary's own field values and only fills gaps from the duplicate, marks the duplicate `mergedIntoId`).
- `apps/web`: `/leads` (list, search, inline add-lead form), `/leads/[id]` (profile — fields, tag chips, notes panel, timeline), `/leads/import` (CSV upload via PapaParse, column-mapping UI, preview, skip-or-update dedupe strategy).
- Extracted `useCurrentWorkspace`/`useCurrentUser` hooks and refactored `/settings` and `/inbox` to use them — this was the third page needing the same workspace-bootstrap fetch.
- Tests: 5 for the merge transaction (identity/note/conversation/task moves, tag re-pointing without a unique-constraint clash, field-value gap-filling, self-merge rejection) + 3 for a DTO validation bug found while testing live (below) — 32 tests total, all passing.

**Real bug found and fixed while testing live against Neon**: `z.string().email().optional()` only skips validation for `undefined`, not `""` — but a blank "Add lead" form field, or any blank cell in an imported CSV column, arrives as an empty string. Every such row was getting rejected with a raw "Bad Request" instead of either succeeding or showing the actual duplicate-check message. This would have broken CSV import for any row with a blank phone/email/name cell — a core part of this item's scope. Fixed with a `blankToUndefined` preprocessor shared by `createLeadSchema`, `updateLeadSchema`, and `importLeadsSchema`'s row shape, with regression tests.

**Also fixed**: the lead profile page's 3-column grid overflowed instead of stacking on narrower viewports (`grid-cols-3` with no responsive breakpoint) — now `grid-cols-1 md:grid-cols-3`.

**Verified live**: added a lead manually, hit the duplicate-check path (confirmed the fix), tagged and noted a lead (both showed up correctly, note appeared in the unified timeline too), searched the list, and imported 2 leads via the real API with one correctly skipped as a duplicate of an existing WhatsApp-sourced lead.

**Simplifications / follow-ups**
- No custom-field management UI yet — that's Phase 1 item 4's scope (Pipelines: custom fields, stage rules, `PipelineSettings`/`FieldEdit`/`StageEdit`). `LeadFieldValue` exists in the schema and the profile reads it, but nothing writes to it yet.
- Timeline has no stage-change or automation/routing/call/meeting events yet since those features don't exist until later phases.
- Bulk actions (assign, move stage, tag, add to sequence, send template, merge, delete) on the leads list from `docs/PRD.md` are single-lead only for now; bulk selection UI is a follow-up.

**Next**
- Phase 1 item 4: Pipelines (board, stages, custom fields, stage rules, move-stage form, labels/terminology).

## 2026-09-25 — First real end-to-end run (Neon + Upstash)

Set up a free Neon Postgres and Upstash Redis so the app could run for real instead of just building. This surfaced two real bugs that only show up with actual infra running — both fixed and pushed:

- **`turbo.json`**: Turborepo 2's default strict env mode was silently stripping the env vars `dotenv-cli` injects before turbo spawns each app's dev task. `apps/api` crashed on boot ("Invalid environment configuration") and `apps/worker`'s Redis client silently fell back to `localhost:6379` even with a real `.env` present. Fixed with `envMode: "loose"`.
- **`GoogleStrategy`**: `env.GOOGLE_CLIENT_ID ?? "unconfigured"` doesn't fall back when the var is unset, because an empty `.env` line loads as `""` (defined, not `undefined`) — `??` only catches `null`/`undefined`. Passport's `OAuth2Strategy` throws synchronously in its constructor on a falsy `clientID`, crashing the whole Nest app at startup. Switched to `||`.
- Also added `dotenv-cli`-wrapped root scripts (`dev`, `db:migrate`, `db:seed`, `db:studio`) since Prisma only auto-loads `.env` from `packages/db`, not the monorepo root.

**Verified live** (not just build/lint/test green): signed up a real user through `/signup`, created a workspace through the real API, and POSTed a simulated inbound WhatsApp webhook straight at `/webhooks/meta` — it flowed through signature verification → raw event storage → BullMQ → the worker's processor → created a real `Lead`/`Conversation`/`Message` in Postgres → published over Socket.IO → showed up live in `/inbox`, where the `/price` quick-reply autocomplete also worked end-to-end. This is the first time the built product has actually run rather than just passed CI.

`.env` now holds real (free-tier) `DATABASE_URL`/`REDIS_URL` — gitignored, not committed.

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

## 2026-09-24 — Phase 1 item 2: unified inbox

**Done**
- `apps/api` `inbox` module: `GET /inbox/:workspaceId/conversations` (filters: mine/unassigned/bot_active/waiting_on_us), `GET .../messages` (cursor-paginated), `POST .../messages` (sends for real via `MetaGraphClient` — Instagram DM or WhatsApp text/template), `POST .../handover` (bot pause/resume), `PATCH .../assign`.
- 24h window enforcement lives in `InboxService.sendWhatsapp`: outside the window a `templateId` is required and must resolve to an `approved` `WaTemplate`, matching CLAUDE.md rule #5. Instagram has no equivalent template mechanism in Meta's API, so it's unrestricted (noted inline).
- `MetaGraphClient` gained `sendInstagramMessage`, `sendWhatsappText`, `sendWhatsappTemplate`.
- Realtime: `RealtimeService` (api, publishes to Redis) + a matching publisher in `apps/worker` + `InboxGateway` (Socket.IO, subscribes to the same Redis channel and forwards to a per-workspace room) — one channel/event shape shared via `@zenora/shared`'s `realtime.ts` so api and worker can't drift. The worker now publishes `message.created` right after storing each inbound Instagram/WhatsApp message, so the inbox updates without polling.
- Quick replies: full CRUD (`workspaces/:id/quick-replies`), workspace-scoped, `settings.manage` for writes.
- Templates: read-only list of approved `WaTemplate`s for the composer's picker — the actual builder + Meta approval sync is roadmap item 7, not built yet.
- `apps/web` `/inbox`: conversation list with the 4 filters, thread view, composer with `/`-shortcut quick-reply autocomplete, automatic template-picker mode when a WhatsApp conversation is outside its window, bot handover toggle, "assign to me", all wired to Socket.IO for live updates.
- Fixed a real bug found while wiring `InboxController`'s class-level `@RequirePermission`: `PermissionsGuard` only ever read handler-level metadata (`reflector.get(..., context.getHandler())`), so a class-level permission decorator was silently ignored. Switched to `reflector.getAllAndOverride(..., [handler, class])` (handler wins), the standard Nest pattern — added a test asserting the guard actually consults both.
- Tests: 4 new worker tests for the WhatsApp processor (mirroring the existing Instagram ones) plus the guard fix's regression test — 24 tests total across the repo. Lint/typecheck/build all green; `/inbox` verified rendering in-browser (degrades gracefully with no API running, same as `/settings`).

**Not yet live-testable**
- Same caveat as item 1: sending/receiving through real Instagram/WhatsApp needs a real Meta app. Nothing new here changes that.

**Simplifications / follow-ups**
- `sendMessage` picks the workspace's *first* connected Instagram account / WhatsApp number when there could eventually be more than one — fine for the single-channel-per-workspace pilot scope, flagged for whenever multi-account support matters.
- No comments/story-reply channel in the inbox yet (DMs and WhatsApp messages only, matching item 1's ingestion scope).
- Right panel (stage, owner, fields, score, tags, AI summary) is deferred — Lead profile is Phase 1 item 3, and AI summary is Phase 2.

**Next**
- Phase 1 item 3: Leads (list, profile, timeline, add/import, dedupe/merge, tags, notes).
