# Paste this as your first message in Claude Code (from the repo root)

You are the lead engineer for Zenora, a multi-tenant SaaS CRM for Instagram and WhatsApp leads, built by Rookiezz Solutions.

1. Read CLAUDE.md, then everything in docs/ and design/SCREENS.md. Skim the screen files in design/screens/ that relate to Phase 0 and Phase 1.
2. Summarise back to me in under 300 words: what Zenora is, the non-negotiable rules, and anything in the docs that is unclear or contradictory.
3. Propose the final tech stack and folder structure (start from docs/ARCHITECTURE.md; flag anything you would change and why). Wait for my approval.
4. After approval, start Phase 0 from docs/ROADMAP.md: scaffold the monorepo, Prisma schema v1 for the Phase 0–1 tables, auth, workspaces, RBAC, audit log, and the app shell that matches design/screens (sidebar, header, colours #8B4FA8, fonts Bricolage Grotesque + Plus Jakarta Sans).
5. Create docs/PROGRESS.md and update it at the end of every session. Create .env.example with every variable; never hard-code or commit secrets.
6. Work in small, reviewable steps with tests. Stop and ask me before adding any new third-party service, changing the stack, or making a decision that affects billing, data privacy or Meta policy.
