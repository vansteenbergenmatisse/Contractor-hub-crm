# Sub-account onboarding (decisions, env, runbook)

Built 2026-11-22. Source of the facts: HighLevel's OpenAPI files and webhook docs on GitHub, read on that date, not yet seen on real responses (`docs/greenlane/hl-api-notes.md`).

## What happens
- **Install (OAuth callback):** an agency (Company) token is stored per `companyId` (encrypted, `TOKEN_ENCRYPTION_KEY`), then every installed location is onboarded. A Location token, if HighLevel ever sends one, onboards that single location.
- **Onboard a location** (`src/features/onboarding/api/onboard.ts`, shared by the callback, the INSTALL webhook and the sync): mint and store the location token, create the tenant, read the location's users from HighLevel, create a CRM user for each (plus a link row), send each new user a "set your password" mail (if enabled).
- **Webhooks:** INSTALL onboards; UNINSTALL marks the tenant uninstalled and deletes its tokens (users are blocked at sign-in and on every page by the tenant status); LocationUpdate renames the tenant; UserCreate/UserUpdate/UserDelete only TRIGGER a re-read of that location's users from the API (the API is the source of truth). Unknown events are stored and acknowledged. User and location event failures still answer 200: the sync repairs them.
- **Sync** `POST|GET /api/integrations/sync` with `Authorization: Bearer <CRON_SECRET>`: onboards installed locations missing from the database, re-reads the users of known ones, and mails `ADMIN_ALERT_EMAIL` about sub-accounts that do not have the app (at most once per 24 hours per sub-account, table `MissingAppAlert`). Idempotent (keyed by `locationId` and the HighLevel user id in `GhlUserLink`). n8n calls it every 10 minutes (POST); `vercel.json` has a daily GET as a backup.
- **Embed sign-in:** if the person has no CRM user but the sub-account is installed and connected, the server asks HighLevel for that location's users, and creates the account only when the person is listed. Otherwise it denies with a reason code in the log only (`location_not_installed`, `not_in_location`, `tenant_*`, `company_mismatch`, `decrypt_failed`, `lookup_failed`, `provision_failed`, `user_disabled`, `role_not_allowed`); the browser always gets the same 403.

## Decisions by Claude (reversible; tell me if you disagree)
1. **Role mapping:** a HighLevel sub-account `admin` becomes our `owner`; every other HighLevel user becomes `office`. Never our `admin` (Forge Forward staff, sees every client).
2. **Agency-level users** (`roles.type` "agency") get no account per sub-account.
3. **Email is the global user key** (Better Auth requires a unique email). An email that already belongs to another tenant or to an admin is skipped and counted as `conflicts` in the sync log. KNOWN RISK (security review F1, medium-high, NOT fixed, needs your decision): a sub-account admin of client A can add a HighLevel user with the email of someone who will join client B; the CRM then holds that email in A, and the person is denied in B. Options: (a) accept and watch the `conflicts` count; (b) tenant-scoped email (a larger change to Better Auth's user table); (c) when HighLevel proves the person belongs to B and the A account has never signed in, move it to B.
4. **Set-password mail** reuses Better Auth's password-reset link, now valid 24 hours (was 1 hour; this also lengthens the public forgot-password link; two separate lifetimes need a custom token flow, not built).
5. **Caps:** at most 50 new users (and mails) per tenant per pass; a pass that would block more than half of a tenant's users (tenants with 5 or more) blocks nobody. Proposals, not measured numbers.
6. **Set-password mail is OFF by default** (`ONBOARDING_SEND_SET_PASSWORD` must be exactly `true`) because `loop-constraints.md` rules 12 and 13 forbid mailing the JCR Landscaping owner. Accounts are created either way. Set it to `true` in production when real clients should get the mail.
7. A user an admin turned off by hand stays off; only users the sync itself blocked (HighLevel removed them) are re-enabled when they come back. A person HighLevel re-created with a new id keeps their CRM account (the link moves).
8. HighLevel's `role` overwrites the CRM role (owner/office) on every sync. A CRM-assigned role is not kept.

## Known gaps
- Sync processes every location in one run (60 s function limit): with many tenants the tail can starve. A cursor or batch is not built.
- Nothing in this was run against real HighLevel or Resend. Unverified: the exact path and answer shape of `/oauth/installed-locations` vs `/oauth/installedLocations`, `/oauth/location-token` vs `/oauth/locationToken`, `GET /users/?locationId=` and its paging, the `UserUpdate`/`UserDelete` payloads (no docs page found), whether Resend accepts the From domain.
- The payload of the embed sign-in has no timestamp or nonce (replay risk, see `docs/ghl-shared-secret-rotation.md`).

## Env (names only; values in Vercel per environment, never in the repo)
`CRON_SECRET`, `ADMIN_ALERT_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `ONBOARDING_SEND_SET_PASSWORD`, `GHL_APP_VERSION_ID` (draft apps), `GHL_OAUTH_SCOPES` (optional scope override). Existing: the `GHL_*` set, `TOKEN_ENCRYPTION_KEY`, `BETTER_AUTH_*`, `APP_URL`, `DATABASE_URL*`.

## Migration
`prisma/migrations/20261122000000_onboarding_tables` creates `GhlUserLink` and `MissingAppAlert` (new tables only). On develop: `set -a; . ./.env.local; set +a; pnpm exec prisma migrate deploy`. Staging and production: CI runs it on merge.

## Runbook notes
- **Rotate `CRON_SECRET`:** set the new value in Vercel (the cron picks it up on the next deploy) and in n8n's header at the same time; between the two the sync answers 401.
- **Sync stuck or failing:** read the `Sync:` log lines (counts and step names only). `failures` counts steps that threw; `conflicts` and `capped` and `suspicious` show skipped users.
- **A person cannot sign in:** the log line `embed_resolve` carries the reason code; `skipped_conflict` means their email lives in another tenant (decision 3).
