# Zenora — security review

Internal review of the whole codebase (API, worker, web, dependencies) carried
out 2026-10-11, with every fix covered by a regression test and exercised against
the running system. This is a **self-review, not a VAPT**: the roadmap's external
penetration test by a third party is still needed before launch.

## What was checked
- Every HTTP route: authentication, workspace scoping, public/unguarded routes.
- Every service that updates or deletes by id: does it verify the record belongs
  to the caller's workspace first?
- Login, sessions, one-time codes, OAuth flows, webhook signature checks.
- Role and invite handling (privilege escalation).
- Dependency advisories (`pnpm audit --prod`), logging of secrets, headers.

## Findings fixed

| # | Severity | Finding | Fix |
|---|----------|---------|-----|
| 1 | High | **Privilege escalation.** Any admin (`members.manage`) could make themselves — or anyone — an owner (billing, workspace control), demote owners, or invite an owner. | Pure policy in `canChangeMemberRole` / `canInviteWithRole`: only owners grant or change ownership, nobody changes their own role (an owner may step down only while another owner exists), the last owner can't be removed. |
| 2 | High | **Cross-tenant IDOR.** The member-role endpoint updated any membership by id, from any workspace. | Looked up by `{id, workspaceId}`; another workspace's id is "not found". |
| 3 | High | **OAuth connect CSRF.** The `state` of the Meta/Google/ads connect flows wasn't bound to a browser, so a victim could be tricked into attaching their Instagram/Google/ad account to an attacker's workspace. | `state` carries a nonce that is also an httpOnly cookie set in the browser that started the flow; the callback needs both, once. |
| 4 | High | **Account pre-hijacking.** Password sign-up never proves email ownership, so an attacker could register a victim's address, then keep the password and sessions after the real owner signed in with Google or an email code. | When an unverified account is claimed by a verified sign-in, the password is removed and every session is signed out (`User.sessionVersion`, checked by the session guard with a 15 s cache). |
| 5 | High (config) | **Meta webhook signature failed open** when `META_APP_SECRET` was unset, letting anyone inject fake messages/leads. | Refused in production; only local development lets unsigned events through. |
| 6 | Medium | **No brute-force protection** on login, sign-up or one-time codes (a 6-digit code could be guessed by requesting fresh codes). | Per-IP and per-account limits (`auth-limits.ts`): login 30/15 min per IP and 8/15 min per account; code requests 5/15 min per target; code guesses 10/15 min per target; sign-ups 10/h per IP. |
| 7 | Medium | **Invites usable by anyone holding the link.** | Accepting requires the account email to match the invite's address; accepting twice is a clear error, not a database error. |
| 8 | Medium | **Login timing revealed which emails have accounts.** | A dummy bcrypt comparison runs for unknown emails. |
| 9 | Medium | **One-time codes written to the log and reported as "sent"** by the stub sender, in any environment. | Outside development the stub refuses with a clear message and never logs a code. |
| 10 | Medium | **Session and OAuth-state tokens were interchangeable** (same key, no purpose claim). | Separate JWT audiences; sessions also carry a version. |
| 11 | Medium | **Vulnerable dependencies**: 42 advisories (2 critical, 16 high) — Next.js 14 (RCE in image optimisation, DoS, SSRF) and transitive `multer`, `postcss`, `qs`, `body-parser`. | Next.js upgraded to 15.5.27; patched versions forced through `overrides` in `pnpm-workspace.yaml`. **42 → 3 moderate.** |
| 12 | Low | Missing security headers. | `nosniff`, frame denial, referrer and permissions policies on the API and web app; `X-Powered-By` removed. |
| 13 | Low | Per-IP limits would key on the proxy's address behind a load balancer. | `TRUST_PROXY` (number of proxies) is honoured; unset by default so addresses can't be spoofed. |
| 14 | Medium | **Foreign ids in request bodies.** A task could name a lead from another workspace and the task list then returned that lead's name and phone; assignees, routing-rule targets and automation assign steps accepted users or teams from any workspace. | `common/workspace-refs.ts` confirms the member, lead or team belongs to the workspace in the URL before anything is written. |

Side effect to know about: existing sessions are signed out once on deploy
(session tokens changed shape), and the account-based login limit means a
determined attacker can lock a *known* account out for 15 minutes.

## Reviewed and found sound
- All other services scope reads/writes by `workspaceId` (scoped `updateMany`,
  or an `ensure…` check before acting). Public lead/booking endpoints are
  rate-limited and give identical answers whether a phone number exists.
- Webhooks: Meta, Razorpay (timing-safe HMAC), outbound webhooks (SSRF guard,
  signed, DNS re-checked on the connecting address). API keys are stored hashed.
- Secrets: channel/integration tokens encrypted at rest (AES-GCM); integration
  secrets are write-only; audit logs hold key names, never values.
- Lead update DTOs accept only name/phone/email (no mass assignment).
- Session cookie is httpOnly, `SameSite=Lax`, `Secure` in production; CORS allows
  only the app origin.

## Known gaps (not fixed here)
- **The content-security-policy still allows inline scripts** (Next needs them to hydrate; a nonce policy would force every page to render per request). It does block plugins, framing, other base URLs and form targets, and limits scripts, frames and network calls to our API, Razorpay and Meta's SDK. Razorpay checkout and the Meta connect popups have never been run against it with real accounts: if one breaks, set `CSP_REPORT_ONLY=true` to see what is being blocked.
- **No two-factor authentication**, no email verification flow, no password-reset
  email (there is no mail provider yet); sessions last 30 days.
- **Rate limits** are counted in Redis when it is reachable, so adding API instances does not multiply them, and fall back to per-process counting if Redis is down (they fail open on purpose: a Redis outage must not lock everyone out of sign-in). The in-process caches (membership roles, session versions) are still per process, with 10-15 s staleness limits.
- Remaining advisories: `@nestjs/core` 10 (needs the Nest 11 upgrade) and
  `file-type` (only reachable through file uploads, which Zenora doesn't offer).
- CI now reports dependency advisories (non-blocking). No automated DAST/SAST, no secrets scanning, no dependency-update bot.
- Third-party credentials (Meta, Google, Razorpay, Anthropic) have never been
  exercised for real, so those integrations are unreviewed against live behaviour.
