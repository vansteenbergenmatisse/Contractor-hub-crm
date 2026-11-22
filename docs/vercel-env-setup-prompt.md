# Prompt: set up the Vercel environment variables (develop, staging, production)

Copy everything below the line into the agent (or follow it by hand). It changes Vercel settings, so whoever runs it must be allowed to change the Vercel project.

---

You are setting environment variables on the Vercel project `forge-forward/contractor-hub-crm` (GitHub repo `vansteenbergenmatisse/Contractor-hub-crm`). Rules: never print, paste or log a secret value; never put a secret in a file in the repo; do not change any variable not listed here; do not deploy `main` or `staging` from code (a redeploy of the existing deployment is fine).

How the project maps environments (checked 2026-11-22):
- **production** = Vercel environment "Production", git branch `main`, domain `crm.forgeforward.io`
- **staging** = Vercel environment "Preview" scoped to git branch `staging`, domain `staging.crm.forgeforward.io`
- **develop** = Vercel environment "Preview" scoped to git branch `develop`, domain `dev.crm.forgeforward.io`

Use the Vercel dashboard (Project -> Settings -> Environment Variables) or the CLI (`pnpm dlx vercel@latest env add <NAME> production`, `... env add <NAME> preview staging`, `... env add <NAME> preview develop`; `env ls` lists names). When adding in the dashboard, pick the environment and, for Preview, type the branch name so the variable only applies to that branch.

## 1. `CRON_SECRET` (all three, a different value each)
- Make three random values, one per environment, for example with `openssl rand -base64 32`. Do not reuse one value.
- Add `CRON_SECRET` to Production, to Preview `staging`, and to Preview `develop`. Type: Sensitive/Secret.
- Why: the user sync endpoint `/api/integrations/sync` refuses to run without it (it answers 500 "Server is not configured."), so the daily Vercel cron fails.
- Keep the values somewhere safe (password manager). Nothing else needs them today; n8n is NOT used.

## 2. `GHL_APP_ID` (fix the scopes)
- Today there is one shared `GHL_APP_ID` set for "Production, Preview" (the LIVE HighLevel app id) and one set for Preview `develop` only.
- Edit the shared one so it applies to **Production only** (value unchanged: the live app id).
- Add a new `GHL_APP_ID` for **Preview `staging`** with the **Test** HighLevel Marketplace app's id (the same Test app develop uses; ask the owner for it if you do not have it).
- Leave the `develop` one as it is.
- Why: staging currently falls back to the live app id, so installs and webhooks on staging would be checked against the wrong app.

## 3. `GHL_APP_VERSION_ID` (develop only)
- Add `GHL_APP_VERSION_ID` to **Preview `develop`** with the version id of the Test app's draft version (HighLevel Marketplace -> the Test app -> versions; ask the owner if unsure).
- Not needed on staging or production while those use a published app.
- Why: installing the draft app from develop needs `version_id` in the install link.

## 4. Optional, only if the owner gives the values
- `GHL_OAUTH_SCOPES`: the exact scope list enabled on the Marketplace app, space separated. Leave unset to use the code's default list.
- `RESEND_API_KEY`, `EMAIL_FROM` (a sender on a domain verified in Resend), `ADMIN_ALERT_EMAIL`: real email. Without them email is log-only.
- `LOGO_HOST_ALLOWLIST`: extra logo hosts besides `assets.cdn.filesafe.space`. Usually not needed.
- Do NOT set `ONBOARDING_SEND_SET_PASSWORD` (it must stay off while JCR Landscaping is the test client).

## 5. Node version
- Project -> Settings -> Build and Deployment -> Node.js Version: set **22.x** (the repo's `.nvmrc`, `engines` and CI use 22; Vercel currently uses 26.x).

## 6. Redeploy and verify
- Environment variables only reach NEW deployments. Redeploy the latest deployment of `develop`, `staging` and `main` (Deployments -> the latest one per branch -> Redeploy).
- Verify with curl, per domain (no secret in the command output):
  - `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://dev.crm.forgeforward.io/api/integrations/sync` must answer **401** (it answered 500 before step 1). Same for staging once staging runs the new code (staging and production still run an older build until `develop` is promoted; there the route may answer 404, which is expected).
  - `curl -s https://<domain>/api/health/db` must answer `{"ok":true,...}` on all three.
- List the names per environment (`pnpm dlx vercel@latest env ls`) and report back a table: variable name x environment = set / not set. Names only.

## Report back
A short list: what was added or changed where, the redeploys done, the curl results, and anything skipped (with why).
