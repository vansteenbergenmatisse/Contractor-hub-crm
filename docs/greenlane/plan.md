# GreenLane build plan (proposal, awaiting the user's go)

Source: `docs/greenlane/build-prompt.md` (spec) and `docs/greenlane/greenlane-dashboard.html` (design). Decisions so far are in `PROGRESS.md` under "Current state". Status: proposal, not started.

Per-ticket loop (all tickets): plan in `PROGRESS.md` "In progress", test first, code, `pnpm check`, Playwright where UI, independent verifier agent, update `PROGRESS.md`, local commit on `develop`, then tell the user what to test on staging. Max 3 revision rounds; stop after 2 rounds with no progress. No push, merge, migration or dependency install without asking.

## Principle: no automation is written in this app

Every automation we run for a client lives in HighLevel as a workflow. This app never sends a follow-up text, a reminder, a review request or a payment chase by itself, and it holds no scheduler or rule engine for them. When a card moves from New Lead to Following Up, to Estimate Booked, to Job Done and so on, the app only changes the opportunity's stage in HighLevel; HighLevel fires the workflows that use "Pipeline Stage Changed" and does the rest. The same goes for a lead added by hand (it posts to the form webhook so the lead-capture workflow runs) and for the Automations page (it lists, switches and edits the sub-account's workflows through the HighLevel workflow API). We build each workflow once, as a template, and copy it to every new client (a HighLevel snapshot or workflow copy; the exact copy mechanism is not yet verified). The only server-side timing the app owns is the 20-second send hold on quotes and invoices (build prompt rule 10), which is a safety delay, not an automation. In Phase 2 no automation exists at all: buttons change mock state on screen only.

## Phase 1: HighLevel install flow, then login

1. Rename feature `home` to `today`; add env parsing in `shared/config` (fails loudly on missing names, never prints values).
2. Prisma models: `Tenant`, `HlAgencyConnection`, `HlLocationConnection`, `WebhookEvent`; AES-256-GCM token encryption with unit tests. Migration created, applied to `develop` only after asking.
3. `highlevel` feature: verify each endpoint in the current HighLevel docs, record fixtures; `/api/integrations/oauth/start` and `/callback` (state check, agency token, location list, location token per location, tenant per location). Dependency check: `@gohighlevel/api-client`.
4. Webhook route: raw body, Ed25519 signature, `appId` check, idempotent by `webhookId`, `INSTALL` and `UNINSTALL`.
5. Token service: refresh or re-mint under a Postgres lock, retry once on 401, `invalid_grant` marks `needs_reconnect`.
6. Better Auth (email and password, invite only, roles owner, office, admin), invite check against the HighLevel users API, log-only email sender interface, sign-in page from the design, tenancy test (user of tenant A gets 403 or 404 for tenant B).
7. `/embed`: user-context decrypt, session cookie `SameSite=None; Secure`, CSP `frame-ancestors`.
8. Brand: custom values to CSS variables at first paint, logo, favicon, contrast rule.
9. `/admin/clients` (admin only).
10. Milestone check on staging (user): Test app installs, tenant shows Connected, owner logs in, `/embed` opens with no second login, tenancy test passes.

## Phase 2: UI on mock data

Mock data sits in marked mock modules (`MOCK DATA` header, one `mock.ts` per feature, all fed from one shared set of sample people and amounts in `src/shared/mock/`), replaced field by field in Phase 3. No automation is written here (see the principle above). Layout shell first (side menu, phone top bar, tab bar, bottom sheets), then one page per ticket in this order: Today, Inbox, Pipeline, Leads, Quotes, Invoices, Payments, Calendar, Automations, Settings. Each page: Playwright at the 14 widths, 44 pt targets, 390x844 thumb check, then `fe:review-final`.

## Next work, in this order (user, 2026-11-22; recorded before a context clear, nothing built yet)

1. **Finish Phase 2 polish**: the round 4 fix list R4-1..R4-12 in PROGRESS.md (lean review rounds: the user's API budget).
2. **Sync in our own code, no n8n.** First the initial syncs: webhooks (INSTALL, UNINSTALL, LocationUpdate, UserCreate/Update/Delete) keep users and locations in step at once; the daily Vercel cron stays as a backstop (needs `CRON_SECRET`); add an on-visit sync (when a tenant user opens the app and that tenant last synced over 10 minutes ago, sync that tenant after the response, rate-limited per tenant). No n8n anywhere.
3. **Pipeline drag and stage picker.** The owner must be able to drag a card to another stage and also select a card and choose another stage (keyboard and phone friendly), with Undo. Phase 2: mock state; Phase 3: the move changes the opportunity stage in HighLevel (no automation in this app).
4. **Email conflicts across clients: option (c) (user decision, 2026-11-22).** One account per email stays (Better Auth's unique email). When HighLevel proves a person belongs to client B while their email sits in client A, and that A account has never signed in, the account moves to B; a used account is never moved (log it as a conflict for an admin). Forge Forward admins sign in across all clients. See `docs/onboarding.md` decision 3.
5. **Login, kept simple (user).** Clients sign in with email and password or with Google, land in THEIR sub-account, and see only that sub-account's data (leads, contacts, everything). Admins can sign in too. Google sign-in needs a Google Cloud OAuth client (user to create; id and secret go in Vercel and `.env.local`).
6. **Custom values drive everything, and Settings writes them back.** Brand colors (the 14 `02_Branding` keys, confirmed from the user's screenshot 2026-11-22; that folder has NO font keys), logo, favicon, sign-in background, business details, services and service areas all come from the sub-account's custom values (key catalogue in `docs/tenant-branding.md`). When the owner changes a value in our Settings, it must update the custom value in HighLevel (write-back; important to the user), and a change made in HighLevel shows in the app (brand cache invalidation on LocationUpdate exists; per server instance).

## Phase 3: wire each page to HighLevel

One ticket per page, replacing mock fields. Also: 20-second send timer on the server, simple per-tenant invoice template (own database, built after the invoice page works), AI quote builder (OpenAI, model name in an env var, tested Astra vs Sol first) with a per-quote usage log, Settings write-back behind an off-by-default flag.

## Phase 4 (last)

Stripe: monthly subscription plus usage from the log (read Stripe's current metering docs first). Slack alert channel for failed sends. Email provider for invites.

## Needs the user

- Test sub-account created and the Test app installed from the agency (not verified by Claude).
- Vercel env vars: see `docs/vercel-env-setup-prompt.md` (a ready prompt for another agent).
- Slack channel set up before phase 4.
