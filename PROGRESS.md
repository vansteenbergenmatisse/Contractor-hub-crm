# PROGRESS

Single source of truth for where the project stands. Read it at the start of every session and before every ticket. Plan work under "In progress" before starting, move it to the Log when done (see "Recording work" in `CLAUDE.md`). Newest log entries first.

## Resume here (for a fresh session)

1. Read `CLAUDE.md` (rules, commands, structure, git flow, Neon) and this file.
2. Repo: https://github.com/vansteenbergenmatisse/Contractor-hub-crm. Local path: `ForgeForward/Contractors_CRM`. Work on `develop`; promote develop to staging to main by pull request.
3. Run `pnpm install` then `pnpm check`. Local env: `.env.local` (Neon `develop`), plus `.env.staging` and `.env.production` for the other branches. All gitignored; never print or commit them.
4. Accounts: GitHub CLI has two logins; the one that matters is `vansteenbergenmatisse` (admin on the repo). `git` pushes with its own stored credential. Neon CLI: `pnpm dlx neon@latest` (or `npx`), logged in with access to org `org-dark-paper-44469290`.
5. Open items are under "Next up" and "Blockers" below. Long-form plans live in `docs/`.
6. The GreenLane build runs as a loop that does not wait for the user between tickets: read `loop-constraints.md`, `docs/greenlane/loop.md` (the per-ticket loop and the context handover), `docs/greenlane/plan.md` (tickets) and `docs/greenlane/build-prompt.md` (spec). Newest handover, if any: `.compact-ultra/handover-*.md` (local, gitignored).
7. After a restart, Claude Code loads the project plugins (`mattpocock-skills`, `loop-engineering`, Looper) and the Neon plugin; `/setup-matt-pocock-skills` has not been run yet (interactive, pick local files).

## Current state

- Branches: `develop`, `staging`, `main` exist on GitHub. PRs #1 (develop to staging) and #2 (staging to main) merged; CI green on all three, including the `migrate` job. Working branch: `develop`.
- Hosting: Vercel (decided 2026-11-20). Domains given by the user (2026-11-20): production `https://crm.forgeforward.io` (git `main`), staging `https://staging.crm.forgeforward.io` (git `staging`), develop `https://dev.crm.forgeforward.io` (git `develop`). Not verified by Claude: whether the Vercel project, the git-branch-to-domain mapping and the Neon env vars per environment are set up. CRM scope and design: to be provided by the user.
- Build spec (2026-11-20): prompt `~/Downloads/greenlane-build-prompt (1).md` and design `~/Downloads/greenlane-dashboard.html` (GreenLane v2). Not yet copied into the repo (user has not answered that). Read the prompt before any ticket.
- Decisions by the user (2026-11-20, dictated; wording below is Claude's reading):
  - Rename feature `home` to `today`. Other features follow the prompt (auth, tenants, brand, inbox, pipeline, leads, and so on). Whether a separate `highlevel` feature is needed: open.
  - Email sender: behind a small interface, with a log-only sender first.
  - Settings write-back to HighLevel custom values: build it, ship it off by default.
  - AI quote builder: NOT deferred, wanted. Built on OpenAI ("ChatGPT"); clients pay about 1 USD per quote built. Model, key, and how the 1 USD is charged: open.
  - Test sub-account: JCR Landscaping. User may supply the HighLevel secrets; they go into Vercel, not chat.
  - Commits: local, per ticket, always on `develop`.
  - Everything is tested on staging; Claude tells the user what to test after each ticket.
  - Verified per ticket means: tests written for every change, `pnpm check`, Playwright, and an independent verifier agent that checks the work stays within the rules. HighLevel calls in tests use recorded fixtures and mocks.
  - Round 2 (2026-11-21): phase 1 is the full HighLevel install flow (not hand-seeded tenants), then login, then the UI on mock data, then wiring. All three roles (owner, office, admin) exist from the start. First develop owner: the email the user gave in chat (kept out of the repo). Stripe: user has a test-mode account. Failed send: owner sees an error with a retry button and Forge Forward is alerted (channel undecided); escalation later. Invoice terms default 7 days. Mock data lives in one marked mock module and is replaced field by field.
  - Context rule from the user: refresh the context about every 180,000 tokens. Claude cannot see the exact token count or run `/clear` itself. Practice: write plan and result to this file after every ticket and at every natural break, so the user can `/clear` and the next session resumes from "In progress".
- Stack: TypeScript 6.0, Next.js 16 (App Router), React 19, Postgres on Neon, Prisma 7.10 with `@prisma/adapter-neon`, pnpm 10, Node 22.
- Features: `today` (empty) and `highlevel` (ticket 3: OAuth install routes, HighLevel client, token store; `/start` denies everyone until ticket 6). `src/shared/config` has `parseEnv(group, source)` for env groups database, highlevel (https URLs enforced), auth. `src/app/page.tsx` is a placeholder page.
- Database: Neon project `small-fog-37891095` (org `org-dark-paper-44469290`), Free plan, Postgres, one Neon branch per environment: `production` (git main), `staging`, `develop`. Prisma schema has the tenants and highlevel models (Tenant, HlAgencyConnection, HlLocationConnection, WebhookEvent) in a migration file that is NOT applied to any Neon branch. Lazy `getPrisma()` in `src/shared/lib/prisma.ts`. `GET /api/health/db` returned 200 `{"ok":true,"database":"neondb"}` against production, staging-credentials check (`migrate status`) and develop.
- CI: `.github/workflows/ci.yml`. `check` (lint, typecheck, test, build) on PRs and pushes; `migrate` (`prisma migrate deploy`) on push to staging and main, using GitHub Environment secret `DATABASE_URL_UNPOOLED` (set on `staging` and `production`).
- Last verified (2026-11-21, after ticket 3): `pnpm check` exits 0. 168 tests (structure, env parsing, encryption, migration and schema, highlevel client, store, start, callback, routes).
- Project-scope tooling in `.claude/` (plugins in `settings.json`, Looper vendored in `.claude/skills/looper/`, see `VENDORED.md`).

## In progress

- (nothing in progress)

## Next up

1. Vercel: done and verified 2026-11-21 (all three domains return 200 on `/` and `/api/health/db`). Still to do by the user before the install-flow ticket: paste `GHL_*`, `BETTER_AUTH_*`, `TOKEN_ENCRYPTION_KEY`, `APP_URL` into Vercel per environment (section 15 of `docs/greenlane/build-prompt.md`), create a test sub-account, and install the Test app from the agency.
2. Ticket 4 (plan in `docs/greenlane/plan.md`): webhook route `/api/integrations/webhooks` (raw body, Ed25519 `X-GHL-Signature`, `appId` check, idempotent by `webhookId`, `INSTALL` and `UNINSTALL`). Open: the public key from the Webhook Integration Guide must be read from the docs (not in the repo), and `webhookId` uniqueness and payload retention are undecided (see Blockers). Applying the ticket-2 migration to `develop` needs the user's approval and comes before any ticket that writes to the database at runtime; ticket 3's routes write to those tables, so nothing can be tried end to end before it.
3. GoHighLevel integration: follow `docs/gohighlevel-integration.md` (needs user decisions and a Marketplace app first).
4. Run `/setup-matt-pocock-skills` (after restarting Claude Code).
5. Add feature tests under `tests/features/<feature>/` as features get logic.

## Blockers / open questions

- Decisions needed from the user (raised by the ticket-2 security review, deliberately not decided by Claude): (1) webhook payload retention: `WebhookEvent.payload` can hold personal data; how long to keep it, and whether a tenant delete or uninstall must purge it (`tenantId` is `SET NULL` today, which orphans payloads). (2) Is HighLevel's `webhookId` globally unique, or should uniqueness include `locationId`? (3) Key rotation for `TOKEN_ENCRYPTION_KEY`: Claude's proposal is no previous-key slot for now; rotation means re-minting tokens (force reconnect), since HighLevel tokens are re-issuable. (4) Approval to apply the migration to `develop`.
- Ticket 3 gaps (security review, round 2 approved with these recorded): (a) a marketplace-started install carries no state and is rejected; if that flow is required the callback needs a different gate: needs the user. (b) State is not bound to the admin session: a signed state that leaks within 10 minutes lets an attacker push their own code through a victim admin's browser; add the admin user id to the signed payload and check it in `/callback` in ticket 6 (required when `/start` opens), with tests for cross-session replay. (c) No server-side used-state list, so single use rests on HighLevel's single-use code and the cleared cookie. (d) No per-IP rate limit and no response size cap on the OAuth routes. (e) The `companyId` guard is read-then-upsert at default isolation; two concurrent installs of one new location by different companies could race; make the claim atomic when a Postgres harness exists, with a concurrency test. (f) A tenant row with a null `companyId` can be adopted by any agency; confirm that is intended. (g) Consider `__Host-` for the state cookie (needs Path=/). (h) A 200 can hide per-location failures; there is no metric or alert yet. (i) No real-Postgres test.
- Open, no decision needed yet: `HlLocationConnection.locationId` duplicates `Tenant.locationId` without a constraint; a CI step that fails when a `NEXT_PUBLIC_<secret>` is set; real-Postgres tests of unique and cascade constraints (no Postgres harness exists); the drift test is valid for one migration only (switch to `migrate diff --from-migrations` in CI when a second one lands); `encrypt` does not force callers to use `aadFor` (review rule for call sites).

- GoHighLevel: needs the login-model decision, auth library choice, and a HighLevel Marketplace app (client ID and secret, scopes, redirect URIs). Plan in `docs/gohighlevel-integration.md`. Several API details unverified.
- The staging database password was pasted into the Claude chat, so it is in the session transcript. Rotate it in the Neon console (Roles), then refresh `.env.staging` and the GitHub `staging` secret.
- The `neon-postgres` Claude Code plugin was installed at user scope (global) by `neon init`, not project scope. Decide whether to move it.
- The driver is the Neon adapter per the user's spec; the Neon skill suggested node-postgres for long-running Node/Vercel. Both work; revisit if Vercel runtime behavior says otherwise.
- CI actions (`checkout@v4`, `setup-node@v4`, `pnpm/action-setup@v4`) run on a deprecated Node 20 runtime that GitHub forces to Node 24. Works today; bump versions later.
- `develop` lacks the two merge commits GitHub created on `staging` and `main`. Harmless; merge `staging` into `develop` if it ever matters.

## Log

### 2026-11-21 - Ticket 3: `highlevel` feature, OAuth install routes
- Resumed from handover 20261121-142207. Done: new feature `src/features/highlevel/` (`api/client.ts` HighLevel client with injected `fetch`, 10 s timeout per request: code exchange `user_type=Company`, paged installed-locations, location token with locationId echo check; `api/start.ts`, `api/callback.ts`, `api/oauth-state.ts`, `api/scopes.ts` (37 scopes of build-prompt section 14), `api/routes.ts` wiring; `db/connections.ts` the only token writer: AES-256-GCM with `aadFor`, tenant upsert by `locationId`, connection upsert, one transaction, refuses a location already owned by another `companyId`); thin routes `src/app/api/integrations/oauth/{start,callback}/route.ts`; `parseEnv("highlevel")` now requires https for `GHL_API_BASE_URL`, `GHL_INSTALL_BASE_URL`, `GHL_REDIRECT_URI`; `CLAUDE.md` "Existing features". No dependency, no schema or migration change, nothing applied, no real HighLevel call (fixtures from `docs/greenlane/hl-api-notes.md`).
- Behavior: `/start` redirects to the install URL with a state `nonce.expiresAtMs.signature` (HMAC-SHA256, subkey derived from `TOKEN_ENCRYPTION_KEY` by a fixed label; no new env var) and sets it in cookie `__Secure-gl_oauth_state` (HttpOnly, Secure, SameSite=Lax, Path=/api/integrations/oauth, 10 min). `/callback` needs a state that verifies, is unexpired and equals the single cookie; then exchanges the code, stores the agency token, lists locations, mints and stores a token per location (a failing location is counted, the rest continue; 502 only when none succeeded); the response is JSON counts `{installed, failed}`, never a token or upstream message.
- Assumptions made by Claude (not in the spec, reversible): (1) `/start` is wired to deny everyone (`noAdminYet`) until Better Auth in ticket 6, so the install cannot be started yet and `/callback` cannot succeed either (only `/start` mints a valid state). (2) State signing reuses `TOKEN_ENCRYPTION_KEY` via a derived subkey instead of a new env var. (3) The callback answers JSON counts because no page exists to redirect to. (4) The install scope list is the 37 scopes of section 14; the docs read did not confirm `chooselocation` accepts them (unverified). (5) Version header `v3` on all three endpoints (reference pages); the guide shows `2021-07-28` for the location token, confirm on staging.
- Tests (red then green per slice): 91 in `tests/features/highlevel/` (client, store, start, callback, routes) plus 7 added to `tests/shared/config/env.test.ts` (added only, no existing assertion changed). Final `pnpm check` (lint, typecheck, test, build) exit 0, 168 tests, run after the last edit and before the commit; both routes appear in the build output.
- Gate 2: round 1: checker APPROVE, test audit REJECT, security REJECT (blocking: state was only compared with the cookie, both from the requester, so a forged cookie passed). Fixed with the signed state, `__Secure-` cookie, duplicate-cookie rejection, expiry, tenant `companyId` guard, timeouts, https env check, and the audit's test gaps. Round 2: all three APPROVE. Applied afterwards: comment fix (`__Secure-` does not block a sibling subdomain, only `__Host-` does), duplicate-valid-cookie test, expiry-boundary test, timeout-value test, cookie-cleared-on-error test.
- Not verified: anything against a real Postgres (no harness; idempotent re-install, rollback and the unique constraints are asserted only against a fake Prisma); anything against real HighLevel; the build-time behavior with real env on Vercel. Not run: Playwright (no UI). Staging: nothing for the user to test yet, the install cannot start until ticket 6.
- Accepted gaps recorded in "Blockers / open questions".

### 2026-11-21 - Ticket 2: token encryption and HighLevel install tables
- Plan was in "In progress" (seams: encryption module; schema plus migration). Done: `src/shared/lib/encryption.ts` (AES-256-GCM, format `v1:iv:tag:ciphertext`, strict 32-byte base64 key, strict base64 parts, IV and tag length checks, required `aad` that binds a ciphertext to its tenant and column, `aadFor` builder, `isValidEncryptionKey`); `parseEnv("highlevel")` now rejects a malformed `TOKEN_ENCRYPTION_KEY` naming only the variable, and `DATABASE_URL_UNPOOLED` is a guarded secret name; models `Tenant`, `HlAgencyConnection`, `HlLocationConnection`, `WebhookEvent` (nullable `tenantId`, indexes) in `prisma/schema.prisma`; migration `20261121000000_highlevel_install_tables` generated offline with `prisma migrate diff`, NOT applied to any database. No dependency added.
- Tests (written first, red then green): encryption (known-answer vector made with raw `node:crypto`, tamper per field, truncated tag, wrong IV length, swapped parts, key edge cases, 1000-IV uniqueness, cross-tenant and cross-column aad), env parsing, a migration test, a drift test (migration SQL equals what Prisma generates from the schema) and a token-field naming test.
- Verification: `pnpm check` exit 0, 69 tests. Three independent verifiers (checker, test audit, security review) ran in 3 rounds. Round 1: checker APPROVE, test audit 5 gaps, security 4 medium; fixed all but four deferred items. Round 2 and round 3: all APPROVE, no blocking items. Deferred items are under "Blockers / open questions".
- Not verified: the migration against a real Postgres; nothing was applied. Not run: Playwright (no UI). Staging: nothing deployed; nothing for the user to test.
- Research for ticket 3 (HighLevel OAuth endpoints, read from the official docs) is saved in `docs/greenlane/hl-api-notes.md`.

### 2026-11-21 - Loop contract written
- User feedback: the loop must keep going between tickets, verified by agents, with a recap and `compact-ultra` near the context limit. Added `loop-constraints.md` (16 binding rules from the user's decisions), `docs/greenlane/loop.md` (per-ticket loop: constraints, plan, red/green, `pnpm check`, three independent verifiers, record, commit, next; handover steps) and `.compact-ultra/` to `.gitignore`.
- Limits stated to the user: Claude cannot read an exact token count and cannot run `/clear` or `/compact`; the handover ends with the user running `/clear`. The loop also stops at rule 15 (dependency, applied migration, secret value, push, undecided question). Docs only; `pnpm check` not run.

### 2026-11-21 - Ticket 1: `home` renamed to `today`, env parsing added
- User said "go", accepted the JCR read-only safeguard, and confirmed seams A (feature structure test) and B (`parseEnv`), and that seams following the plan are listed per ticket and treated as confirmed unless the user objects.
- Done: `git mv src/features/home src/features/today` (comments, `CLAUDE.md` "Existing features" and the commit example, the comment in `prisma/schema.prisma`). Added `src/shared/config/{env,index}.ts`: `parseEnv(group, source = process.env)`, lazy; missing or blank names throw an error listing names only; any secret with a `NEXT_PUBLIC_` prefix throws (checked for all five secret names whatever the group); returned values are trimmed. No dependency added. `.env.example` lists the new names with empty values.
- Tests (written first, red then green): `tests/shared/config/env.test.ts`, 10 tests. Seam A needed no new test: the rename has no real red step, the existing structure test passes before and after.
- Checks: `pnpm check` exit 0 (lint, typecheck, 13 tests, build). The build ran with the local `.env.local` present, so "builds with no env" is by design (nothing reads env at import time) and not separately run.
- Independent verifier agent: APPROVE. Acted on: stale `home` references, a cross-group `NEXT_PUBLIC_` test, trimming values. Left as is: untested empty-string `NEXT_PUBLIC_X` (rejected by design), `SECRET_NAMES` is a hand-kept list (client ID and URLs are not treated as secrets), missing-names test depends on the order of names in the group.
- Not run: Playwright (no UI yet). Staging: nothing deployed from this change; nothing for the user to test yet.

### 2026-11-21 - JCR facts received
- From the user (pasted, not verified by Claude): JCR Landscaping is a sub-account of the ForgeForward agency. Its only existing user is the client owner, role "Account - user" (not admin). The user's own email was added to JCR as Admin, so the invite check can match it. The JCR location ID, owner user ID and owner email were given in chat; they are not written here because they belong to a real client. Ask the user again or read them from the HighLevel install.
- Rules from the user's pasted notes: staging never emails the JCR owner; test invites go to the user's own email first. Staging only reads from JCR: no texts, no contact changes. This matches the read-only safeguard below; the user has not yet confirmed it in their own words.
- Test login plan (Claude's reading): the user's own email, as an HighLevel user of JCR, is the first owner on staging.
- Docs only; `pnpm check` not run.

### 2026-11-21 - Commit cadence and JCR as the test account
- User decisions: commit after every major step so the log explains each step (changed in `CLAUDE.md` "Git workflow"; commits stay local on `develop`, push only after asking). Dev env vars are not set; only staging and production, so work targets staging. JCR Landscaping (a real client) is the test sub-account, not the user's own email; the only setup is giving the Forge Forward agency authority over it. Not verified by Claude: whether JCR sits under the Forge Forward agency, and which JCR user is the first owner.
- Safeguard proposed by Claude (not decided): until the user says otherwise, the code touching JCR only reads. No sends, no custom-value writes, no workflow publish.
- Docs only; `pnpm check` not run.

### 2026-11-21 - Round-3 answers and build plan drafted
- User answers: Vercel env vars are set for production and staging (user's statement; dev not confirmed; Claude cannot read Vercel). Invoice template: Claude picks a simple one, stored per tenant in our database, built after the invoice page works. Failed-send alerts go to a Slack channel, in the last phase (Slack not set up yet). Stripe: the plan is a monthly subscription of 397 (currency not stated) plus usage billing; the user says the discount and products already exist in Stripe test/staging. Claude has not checked Stripe.
- Wrote the phased plan to `docs/greenlane/plan.md` (proposal, awaiting the user's go; no code changed, `pnpm check` not run).

### 2026-11-21 - Round-2 answers recorded, Vercel unblocked
- User disabled Vercel Authentication. Verified with curl: `staging.` and `dev.` now return 200 on `/` and `/api/health/db` (`{"ok":true,"database":"neondb"}`), same as production. Docs only; no code changed, `pnpm check` not run.
- OpenAI research (subagent, read from developers.openai.com, no page date shown): flagship models listed are gpt-6.2-astra ($8/$40 per 1M tokens in/out), gpt-6.2-sol ($2/$10), gpt-6.1-terra ($1/$5), gpt-6-luna ($0.10/$0.50). The docs say "for new projects, start with gpt-6.2-astra" for Structured Outputs and give no per-model strict-mode matrix or pinning advice. Final model choice is made in the quote-builder ticket after a measured test.
- Open: invoice template scope (see chat), Forge Forward alert channel, which Stripe usage mechanism.

### 2026-11-20 - Build spec copied into the repo, round-1 decisions recorded
- Copied the prompt to `docs/greenlane/build-prompt.md` and the design to `docs/greenlane/greenlane-dashboard.html` (812 KB, fake sample data only). Scanned both for secret-looking values: none found (the prompt holds HighLevel app IDs and URLs, which are not secrets). Docs only; `pnpm check` not run. From here on read `docs/greenlane/build-prompt.md`, not `~/Downloads`.
- Verified read-only: `crm.forgeforward.io` and its `/api/health/db` return 200. `staging.` and `dev.` return 302 "Protected by Vercel Authentication", so HighLevel cannot reach them yet. Vercel env vars: `DATABASE_URL` exists for Production, Preview/staging, Preview/develop (from the user's screenshot, not independently checked).
- Decisions by the user (round 1, dictated; Claude's reading):
  - Keep the `highlevel` feature (the only place that calls the API). JCR Landscaping is a real client and the only account; a dedicated test sub-account is allowed and is the safer choice, so JCR is touched only for a final check the user watches.
  - AI quote builder is in scope. Usage is logged per quote, then sent to Stripe afterwards; a monthly aggregate is a maybe. Stripe API details are not yet checked.
  - Commits: local on `develop`. Push only after asking the user each time.
  - Build order: login first, then UI, then wiring the backend. Exact meaning to be confirmed in round 2.
  - Dependencies: approved per ticket. Revision cap: 3 rounds per ticket, plus stop after 2 rounds with no progress.
- Vercel protection: the user wants staging and dev unblocked. Per Vercel docs (read 2026-11-20): Settings, Deployment Protection, toggle Vercel Authentication off, or use Deployment Protection Exceptions to unprotect single domains. Unverified: whether a custom domain tied to a git branch counts as a production domain under Standard Protection.

### 2026-11-20 - Full state saved for a context reset
- Plan: persist everything needed to resume without chat history: write `docs/gohighlevel-integration.md`, rewrite this file (resume guide, accurate current state, cleaned blockers), commit the generated `AGENTS.md`.
- Done: all three. Docs only; no code changed, `pnpm check` not re-run. `AGENTS.md` is generated by `next dev` (tells agents to read `node_modules/next/dist/docs/`); committed to keep the tree clean. Fixed stale lines in this file (Neon branch mapping was listed as undecided, one blocker line was garbled).

### 2026-11-20 - Recording rule added to CLAUDE.md
- Added a mandatory "Recording work" section to `CLAUDE.md` (plan before acting, result after, same commit, no secrets) and an "In progress" section to this file; per-ticket loop steps 1 and 4 updated. Docs only.

### 2026-11-20 - Vercel hosting and GoHighLevel plan noted
- User decided hosting is Vercel. Researched HighLevel access (OAuth Marketplace app, agency vs location tokens, user context) and gave the user the phase-by-phase plan; nothing built.

### 2026-11-20 - Promoted to staging and main
- Set GitHub Environment secret `DATABASE_URL_UNPOOLED` on `staging` and `production` from the local env files (values never printed). Logged `gh` in as `vansteenbergenmatisse` (the earlier login had no repo access).
- PR #1 develop to staging merged: CI `check` 33s and `migrate` 16s passed. PR #2 staging to main merged: `check` 23s and `migrate` 17s passed. `prisma migrate deploy` ran with the real secret on both; there are no migrations yet. Final output line of `migrate` not captured, only that the job succeeded.

### 2026-11-20 - Develop branch live, pushed
- Neon `develop` branch (`br-steep-shadow-bbk1ch83`) exists. Saved production URLs to `.env.production` (gitignored), then pointed `.env.local` at develop via `neon checkout develop` + `neon env pull`, so local work no longer touches production data.
- Verified: `GET /api/health/db` returned 200 against develop; `prisma migrate status` reached it. Pushed `develop`; CI on develop succeeded (40s).

### 2026-11-20 - Staging credentials saved
- Neon branch `staging` (`br-bitter-voice-bbb8dn5q`) created by the user. Saved pooled and direct URLs to `.env.staging` (gitignored, mode 600). `prisma migrate status` reached it: connection works, no migrations applied yet.

### 2026-11-20 - Database layer per spec
- Switched driver to `@prisma/adapter-neon` (removed `@prisma/adapter-pg`, `pg`); added `dotenv`, `tsx`. `prisma.config.ts` loads `.env.local` then `.env`; reads `DATABASE_URL_UNPOOLED` directly (not `env()`, which throws and would break `prisma generate` in postinstall/CI).
- `getPrisma()` is lazy: the first version built the client on import and `next build` failed without env vars. Fixed and verified.
- Health query needed `::text` (Neon adapter cannot deserialize Postgres `name`).
- `.env.example` has empty values. Added `.nvmrc` (22), `engines`, and `.github/workflows/ci.yml`.
- Checks: `pnpm check` passes with and without env vars. Live `GET /api/health/db` returned 200.

### 2026-11-20 - Neon wired
- Ran `neon init` (org `org-dark-paper-44469290`, project `small-fog-37891095`, branch `production`, postgres) via `npx neon@latest`; the first attempt failed because the login lacked org access, retried after `neon login`. `neon config plan` and `neon deploy` reported no changes. `.env.local` pulled (gitignored).
- Added `neon.ts`, deps `@neon/config`, `@neon/env`, `postinstall: prisma generate`, `src/shared/lib/prisma.ts`, `src/shared/lib/db-health.ts`, `src/app/api/health/db/route.ts`.

### 2026-11-20 - Test script and build scripts
- Added `tests/architecture/features.test.ts`: every folder in `src/features/` must be kebab-case and contain `components/ api/ db/ hooks/ types.ts index.ts`. It failed on `home` (missing `types.ts`, `index.ts`), so both were added as empty exports.
- Removed `--passWithNoTests`. Approved build scripts for `prisma`, `@prisma/engines`, `esbuild` via `pnpm.onlyBuiltDependencies` (read all three scripts first).

### 2026-11-20 - App initialized
- Added pnpm project: Next.js, React, Prisma, ESLint, Vitest, TypeScript. Configs: `tsconfig.json`, `next.config.ts`, `eslint.config.mjs` (includes the feature-boundary `no-restricted-imports` rule, verified with a temporary violating import), `vitest.config.ts`, `prisma.config.ts`.
- Pinned TypeScript to 6.0.3 (typescript-eslint does not support 7.x) and the Prisma CLI to 7.10.1 (matching the client; `latest` resolved to an 8.0 release candidate). Defined commands in `CLAUDE.md`; added `pnpm check`.

### 2026-11-20 - Repo foundation
- Created repo with `main`, `develop`, `staging`; pushed to GitHub. Installed project-scope plugins `mattpocock-skills`, `loop-engineering`; vendored Looper into `.claude/skills/looper/`.
- Chose the feature-first single-app structure; wrote `CLAUDE.md` and `src/features/CLAUDE.md`.
