# SOP: install the HighLevel app and add clients

Written 2026-11-22 from the code, `docs/greenlane/build-prompt.md` and that day's install attempts.

**Status: the install from our link worked on dev for JCR on 2026-11-22. On 2026-11-24 "Select all" on dev connected the agency's 3 other sub-accounts through the `INSTALL` webhook (see "Proven on dev, 2026-11-24").** On 2026-11-24 a sub-account Admin of a brand-new sub-account signed in to the CRM through **Sign in with HighLevel** on a laptop (owner sign-in proven on dev). A snapshot copies custom value names, keys and folders but **not their values**: a new sub-account starts with every value blank (throwaway: 16 folders, 320 blank values). Staging and production have not been installed. Steps marked **(not proven)** have not been run for real. After the first success in each environment, remove the mark or correct the step. A snapshot may not carry the app, so assume each new sub-account needs the Install steps.

**Matt's step-by-step version for the team** (Part A one-time setup, Part B per client, owner message, checklist): `docs/sop-step-4-add-client-to-crm.md`, copied from his SOP file on 2026-11-24 and updated with that evening's findings. It adds to this file: the dev `HIGHLEVEL_CRM_MENU_URL` template (set on Preview `develop`), the owner's message text, Step 10 (connect email and calendar in HighLevel) and the "not built yet" list. Keep both in step: this file is the technical source.

## The short version

- **You do not install per sub-account.** The intended setup is one install per environment, from the agency, with "all sub-accounts" selected in production.
- **A new client should then appear by itself (not proven).** Tick **"Select all N sub-accounts"** on HighLevel's install screen. HighLevel then sends an `INSTALL` event for each new sub-account, and the app creates the client and its users, even when the event has no company id. A `LocationCreate` event is a second way in (switch it on, see "Webhook events" below). Backstops: the daily sync at 05:00 UTC (production only), a background check each time an admin opens `/admin/clients` (at most once per 5 minutes per agency, every environment), and the **Check for new sub-accounts** button there. All of them connect only sub-accounts that HighLevel lists as having the app installed. `/admin/clients` also has a **Connect sub-accounts** button that opens the install link.
- **Always start the install from our link**, `<environment URL>/api/integrations/oauth/start`, signed in as a CRM admin. An install started from HighLevel's App Marketplace page is not accepted by our callback and leaves the client unconnected.

## Environments

| | Dev | Staging | Production |
|---|---|---|---|
| Site | `https://dev.crm.forgeforward.io` | `https://staging.crm.forgeforward.io` | `https://crm.forgeforward.io` |
| Git branch | `develop` | `staging` | `main` |
| Neon branch | `develop` | `staging` | `production` |
| HighLevel app | Forge Forward CRM Test | Forge Forward CRM Test | Forge Forward CRM |
| Sub-accounts to select | Only the test account | Only the test account | All sub-accounts |
| `GHL_INSTALL_BASE_URL` | `https://marketplace.leadconnectorhq.com` | same | same |
| `GHL_REDIRECT_URI` | `<site>/api/integrations/oauth/callback` | same pattern | same pattern |
| `GHL_APP_VERSION_ID` | Test app's draft version | Test app's draft version, if still a draft | Only if the live app is a draft |
| `ONBOARDING_SEND_SET_PASSWORD` | Off | Off | Off until you decide to mail clients |

The build prompt lists `marketplace.gohighlevel.com` as the install host. That host failed for our white-label app, so use the value above.

**The Test app has one webhook URL.** On 2026-11-22 its events were arriving on dev, while the build prompt says staging. Point it at the environment you are testing. The other environment then gets no live events and relies on the daily sync. Do not run dev and staging installs at the same time.

## Webhook events (once per HighLevel app)

In the HighLevel developer portal, open the app, then **Advanced Settings**, then **Webhooks**. Set the webhook URL to `<site>/api/integrations/webhooks` and switch on: **LocationCreate**, LocationUpdate, UserCreate, UserUpdate, UserDelete. LocationDelete is not used. Without LocationCreate, a new sub-account connects only through its INSTALL event or the reconcile.

The portal's event list has **no INSTALL or UNINSTALL switch** (seen 2026-11-24). They arrive anyway: on 2026-11-24 dev received five `INSTALL` events at the moment of the "Select all" install, with only the events above switched on.

## Before any install

1. The environment runs the current code. Promote `develop` to `staging` to `main` by pull request. On 2026-11-22 staging and production still ran older code.
2. In Vercel, for that environment only, every `GHL_*` variable, `TOKEN_ENCRYPTION_KEY`, `BETTER_AUTH_*`, `APP_URL` and `CRON_SECRET` is set. See `docs/vercel-env-setup-prompt.md`. Redeploy after any change.
3. `ONBOARDING_SEND_SET_PASSWORD` is **not** `true`, unless you mean to email every user of every selected sub-account.
4. `/api/health/db` on that site answers 200.
5. You have a CRM **admin** account on that environment, and a HighLevel login with a password for your agency. HighLevel's install login has no Google option on the screen we saw.

## Install

1. Sign in at `<site>/sign-in` with the CRM admin account.
2. In the same browser, open `<site>/api/integrations/oauth/start`. The link is valid for 10 minutes.
3. Log in to HighLevel if asked, and click **Install**.
4. Select the sub-accounts from the table above, then approve.
5. First install for the agency: you land on a plain page on our site, such as `{"installed":1,"failed":0}`. **When the app is already installed** (HighLevel shows **Install to more sub-accounts**), HighLevel does not come back to our site: the browser stays on `marketplace.leadconnectorhq.com/v2/oauth/chooselocation` and shows the app page again (seen on dev, 2026-11-24). That is fine: the new sub-accounts connect through their `INSTALL` webhooks, using the agency connection stored by the first install.
6. Open `<site>/admin/clients` and confirm each client shows **Connected** (on 2026-11-24 they were there within a minute; the clients were created about one second after the webhooks arrived).
7. Open the client's Leads page and confirm its own leads show.

### Environment notes

- **Dev and test accounts:** select only the test sub-account. JCR Landscaping is a real client and stays read-only.
- **Staging:** first set `GHL_APP_ID` to the Test app id. It was found pointing at the live app on 2026-11-21. Then point the Test app's webhook URL at staging.
- **Production:** test any pending migration on a Neon branch first. Since 2026-11-24 the Vercel build applies migrations for `staging` and `main` (CI no longer does); follow `docs/release-migrations.md` and check `<site>/admin/migrations` shows none pending. Selecting all sub-accounts creates CRM accounts for all their users, so confirm the mail setting first.

### New app permissions (scopes) and re-approve

Checked 2026-11-24. The CRM does **not** store which permissions a token was granted, so the database cannot tell whether a sub-account already has a new scope such as `medias.readonly`/`medias.write`. Test it instead: one image action (Settings, Add image) on that sub-account. "Needs media permission" means the token lacks it.
- Adding scopes in the developer portal does not show a re-approve button on an installed app: the start link lands on the installed app page with **Uninstall** only.
- Lowest-risk way to refresh one sub-account: Uninstall the app on **that sub-account only**, then reinstall from `/admin/clients` > **Connect sub-accounts** selecting only it. Its CRM client row, users, locks and audit rows are kept and come back connected.
- **What Uninstall does:** on a **sub-account**: its stored tokens are deleted, the client becomes `uninstalled` (row kept), users and their links are kept, their sessions stop working until reinstall, locks and audit rows are kept. Reinstall reconnects the same client row and re-syncs users. On the **agency**: only the agency token is deleted; clients stay connected on their own tokens, but new sub-accounts cannot connect until the agency installs again from our link. **Never uninstall at agency level on production without a plan.**

## Add a new client (after the install)

Updated 2026-11-24 (merged into `develop`, deployed to dev).

**How a new sub-account gets connected (the reconcile).** Four ways in, all of which connect a sub-account only when HighLevel's installed list for our agency (queried with our app id) names it. The agency's other sub-accounts are never connected.
- The `INSTALL` webhook, with or without a company id.
- The `LocationCreate` webhook (switch it on, see "Webhook events"). If the new sub-account is not in the installed list yet, the app answers 500 so HighLevel retries. If HighLevel says `installToFutureLocations` is false, it answers 200 and creates nothing.
- A background check each time an admin opens `/admin/clients`, in every environment: at most once per 5 minutes per agency, no admin emails. It also re-reads the users of known clients (deactivations, and set-password mails when `ONBOARDING_SEND_SET_PASSWORD=true`).
- The **Check for new sub-accounts** button on `/admin/clients` (admin only, 3 per minute per admin, new sub-accounts only). It reports how many it connected.
- The daily sync at 05:00 UTC still runs, on production only.

**Steps, from new sub-account to owner signed in:**
1. Create the sub-account in HighLevel and load the JCR snapshot. The snapshot also adds a "JCRlandscaping Account Files" item to the left menu; that comes from the snapshot, not from the CRM.
2. Set the sub-account's email. The snapshot leaves every custom value blank. Fill them from the template first: on `/admin/clients`, **Copy from template** on the new client's row (needs `TEMPLATE_COPY_ENABLED=true` and `TEMPLATE_TENANT_ID`; preview first, then apply; fills blank values only, images re-uploaded into the new sub-account; `docs/onboarding.md` "Copy values from template"). Then replace the template values with the client's own (`docs/tenant-branding.md`), in HighLevel or through **Edit values** on the client row. The row warns "still template values" until the identity values differ. Then **lock** the values the owner must not change ("Set, then lock" in `docs/onboarding.md`).
3. Add the client's users in HighLevel (the owner as a sub-account admin becomes our `owner`).
4. Open `/admin/clients`. The background check runs on that visit. If the client is not there, click **Check for new sub-accounts**, then reload.
5. If it is still missing, the app is not installed on that sub-account. Check in HighLevel, then repeat the Install steps from our link and include it. The daily sync (production) also emails `ADMIN_ALERT_EMAIL` about sub-accounts without the app.
6. The client row shows the CRM tenant id with **Copy id**. Use it for the per-client flags in Vercel (`docs/onboarding.md`, `.env.example`).
7. Owner access, main path: **Sign in with HighLevel** (no CRM password needed). Set up once per environment, see "Owner access: Sign in with HighLevel" below. Send the owner `<site>/sign-in?client=<slug>` (their personal sign-in link from the client row) so the button opens their own CRM page.
8. Optional, only if the owner also wants an email and password: give the owner a password. Either:
   - **Automatic:** with `ONBOARDING_SEND_SET_PASSWORD=true`, every new HighLevel user gets a "set your password" email when the account is created (24-hour link, at most 50 per client per day). Leave it off wherever the JCR owner could be emailed.
   - **By hand:** click **Users** on the client row. It lists the client's users and whether they signed in. **Send sign-in email** (for people who never signed in) makes a fresh 24-hour set-password link, emails it if the email guard allows, and always shows the link with **Copy link**. The page says exactly when the email was held back, the daily limit was hit or the email service refused it. Only the newest link works, so a second click cancels the first email's link.
   - **Invite owner** on an email that already has a never-used account in the same client now returns a set-password link instead of `email_taken`. A used account gets "ask them to use Forgot password"; a turned-off or removed account gets "login is turned off".
   - Then the owner opens the link, sets a password and signs in at `<site>/sign-in` under "Or use your email and password". **Forgot password** on the sign-in page works for synced users too (24-hour link).

**Per-client checks** (taken from the user's SOP "STEP 4", Part B, 2026-11-24):
- **View client** (read-only, 1 hour): Leads, Pipeline and Calendar show this client's data, and the name, logo and colors are theirs, not the snapshot's.
- **Custom values** (sub-account Settings > Custom Values, from the client's TXT file): `01_Business_essentials` (name, owner, phone, email, address, city, state, main county, hours in 24-hour form for weekdays, Saturday and Sunday, logo and favicon links, universal CTA, main background image, not a video), `01b_Google_Business_Profile`, `01c_booking_links`, `02_Branding` (the 14 colors as hex). Replace every snapshot value. A main color that fails contrast with "text on main color" falls back to the default green.
- **Users:** the owner as sub-account **Admin** (CRM `owner`), office staff as **User** (CRM `office`), real emails. They appear under **Users** on the client row. One email is one CRM account across all clients.
- **Owner message:** accept the HighLevel invite first, then open the personal sign-in link on phone and laptop, tap **Sign in with HighLevel**, then **Continue**; on the phone, Share > Add to Home Screen. The CRM item in the HighLevel menu also works.
- **HighLevel setup:** a phone number with A2P approved (the CRM cannot read A2P; note the date confirmed); calendars named exactly `Job`, `Jobs`, `Estimate`, `Estimates`, `Schedule a Job` or `Request an Estimate` for the later "On my way" text; the snapshot's pipeline and stages present; the client's email and calendar connected in HighLevel, or Inbox and Calendar stay empty.
- **Write switches stay off** for a new client (Settings write-back, logo replace, new lead create, Routes notify). Forge Forward turns them on per client after testing, using **Copy id**.
- **Done:** the owner shows "Has signed in" under **Users**; note "Added to CRM on <date>" in the client's TXT file.

**Email env vars (names only):** `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_DELIVERY_MODE` (`allowlist` or `live`), `EMAIL_ALLOWED_RECIPIENTS` (allowlist mode), `APP_URL`, and `ONBOARDING_SEND_SET_PASSWORD=true` only if the sync should mail new users itself. Keep dev on `allowlist`: in `live` mode **Send sign-in email** for the JCR owner would really email them.

**Proven on dev, 2026-11-24** (user's browser session, plus the `WebhookEvent` and `Tenant` rows on Neon `develop`):
- Install from our start link as CRM admin, app already on JCR: HighLevel offered **Install to more sub-accounts**, "Select all 3 sub-accounts", with **Auto-install on future sub-accounts** on by default (left on). 186 scopes approved. No redirect to our callback (see Install step 5).
- Five `INSTALL` events arrived in the same second (13:37:05 UTC). The three new clients were created at 13:37:06 UTC, so the `INSTALL` webhook connected them, not the `/admin/clients` check.
- `/admin/clients` then showed four Connected clients: the three new ones (one with 1 user, two with 0 users) and JCR.

**Proven on dev, 2026-11-24, second test (a brand-new sub-account, user's browser session plus Vercel logs):**
- Snapshot "Forge Forward – Landscaping Core v2.0" (all 647 assets from JCR) loaded into a new sub-account.
- It connected by itself: two `INSTALL` webhooks at 14:44:49–50 UTC, each logging `Onboarding: INSTALL users created=0 linked=0 failed=0` (the sub-account had no users yet). Connected on `/admin/clients` within a minute. No `LocationCreate` line appeared in the logs.
- The new sub-account got the app's Custom Page as its **CRM** menu item automatically. An agency custom menu link does not reach new sub-accounts.
- Found in View client: Settings said "Your details did not load" (cause being traced, see `PROGRESS.md`); the read-only banner covered the top of the More sheet at about 520px (fixed 2026-11-24).

**Not proven yet:**
- how late the `INSTALL` event comes in general (one sample: within seconds), and whether `LocationCreate` is ever sent;
- how soon it appears in `/oauth/installed-locations`, and whether minting its token fails before the install finishes;
- whether `installToFutureLocations` is really sent, and the real `LocationCreate` payload;
- that a real email arrives (no mail was sent; the Resend From domain is unchecked);
- the button, the Users panel and the background check in a browser (component tests only).
- An account made before the `UnusedAccountMarker` migration can't be proven unused, so it gets no admin link; that person uses Forgot password. (Since `integrate/signin`, **Invite owner** on an existing account counts against the 50-per-day client cap.)

On dev and staging, a new test sub-account is picked up only if the app is installed on it. **User decision (2026-11-24): on dev, install with "Select all" (including future sub-accounts)** to prove auto-connect. This creates CRM accounts for the agency's other sub-accounts and sends them no email while `ONBOARDING_SEND_SET_PASSWORD` is off. It writes nothing to HighLevel, so JCR stays read-only. Staging: still select only the test sub-account unless the user says otherwise.

**Order for the one-time setup on an environment:** (1) switch on the webhooks ("Webhook events" above), (2) run the Install with "Select all", (3) point the app's Custom Page at `<site>/embed` and set `HIGHLEVEL_CRM_MENU_URL` ("Owner access: Sign in with HighLevel" below). The owner's HighLevel password is typed by the user, never by an agent.

## Owner access: Sign in with HighLevel

Added 2026-11-24 (merged into `develop`, deployed to dev). User decision: one login for the client, their HighLevel login. Email and password stay as an optional second way in. Facts and unknowns about HighLevel's side: `docs/greenlane/hl-api-notes.md`, "Sign in with HighLevel".

**The CRM menu item is the marketplace app's Custom Page, not an agency custom menu link.** Tested on dev 2026-11-24 (once, as the agency admin, on `app.gohighlevel.com`): an agency custom menu link `CRM` → `<site>/embed`, Embedded Page (iFrame), showed "Signing you in…" and then "HighLevel did not answer". HighLevel's docs describe the user-context request (`REQUEST_USER_DATA`) for a marketplace app's Custom Page only, and the agency link did not answer it. Do not use an agency custom menu link for the CRM; delete it if one exists, or the sub-account shows two CRM items.

**One-time setup per environment (developer portal, then Vercel):**
1. In the HighLevel developer portal, open the app and set its **Custom Page** URL to `<site>/embed` (for dev `https://dev.crm.forgeforward.io/embed`). No placeholders: identity comes only from HighLevel's encrypted user context. **(not proven)** whether a change to the Custom Page URL reaches sub-accounts that already have the app without publishing a new version, and that the Custom Page then answers the user-context request.
2. Open a sub-account, click **CRM** in the left menu, and copy the address bar. Replace that sub-account's id with `{locationId}` (exactly one), keep `https://`. Seen on dev: `https://app.gohighlevel.com/v2/location/<locationId>/custom-page-link/<customPageId>`. The `<customPageId>` is the same in every sub-account (confirmed by the user on JCR and the test sub-account, 2026-11-24).
3. Use the host the clients log in on. Clients of Forge Forward use the white-label host `https://app.forgeforward.io` (the agency admin uses `app.gohighlevel.com`). So the template is `https://app.forgeforward.io/v2/location/{locationId}/custom-page-link/<customPageId>`. The white-label host uses the same path (confirmed by the user on JCR, 2026-11-24).
4. **Code prerequisite:** `/embed` may only be framed by the hosts in `src/shared/config/frame-headers.ts`: `app.gohighlevel.com`, `app.leadconnectorhq.com` and, since 2026-11-24, `app.forgeforward.io`. The environment must run that code before the Custom Page points at it, or the CRM page is blank on the white-label host. Another white-label host needs its own entry.
5. In Vercel, for that environment only, set `HIGHLEVEL_CRM_MENU_URL` to that template and redeploy. It is not a secret. Unset or invalid: the button opens `https://app.gohighlevel.com/` and tells the person to open their business, then CRM.

The old "Install your app" guide (a page on `sites.leadconnectorhq.com`) was the Custom Page's target until now. Its "Open the CRM" button and QR code point at production, which runs older code. `/embed` replaces it: after sign-in it offers **Open full screen**, **Open in a new tab** and **Use it here, inside HighLevel**.

**What the owner does (laptop or phone browser):**
1. Opens `<site>/sign-in?client=<slug>` (or `<site>/sign-in`). Taps **Sign in with HighLevel**.
2. HighLevel opens (its own login if needed, never our page), on that sub-account's CRM page. Without `?client=`, they open their business and tap **CRM**.
3. `/embed` inside HighLevel signs them in and gets a single-use, 2-minute handoff token. It then moves the whole tab to `<site>/device-sign-in` once per browser tab, replacing HighLevel's page in the history so Back does not loop. If HighLevel's frame does not allow that, the page shows **Open full screen**, **Open in a new tab** and **Use it here, inside HighLevel**.
4. On `/device-sign-in` the owner taps **Continue**. The device gets a normal long session (1 year, renewed daily while used; unchanged by this work) and lands on Today.
5. Back in HighLevel later in the same tab, the CRM page shows the three buttons instead of jumping again.

**Fallback, another device:** in the CRM menu, **Open on my phone or laptop** makes a single-use, 5-minute link to copy (owner and office users). Opening it on the other device and tapping **Continue** signs that device in. There is no QR code yet (no QR library in the project; the sheet says so).

Before **Continue**, `/device-sign-in` says who and which business the link signs in ("This link signs in j•••@gmail.com at <business>.", masked email, business name from the client's tenant record). If someone else is already signed in on that device it warns "You are signed in as m•••@outlook.com on this device. Continue signs you in as j•••@gmail.com instead." with **Continue as j•••@gmail.com** and **Stay signed in as m•••@outlook.com**. The check (`POST /api/auth/device-sign-in-preview`) does not use the link up; only Continue does. An expired or used link shows the expired message and no Continue.

**Only owners and office users** of a connected client get a handoff or pairing link. Forge Forward admins sign in with email and password.

### Who gets in, and what they see (2026-11-24)

No Forge Forward approval per user or per sub-account. HighLevel's own user list for the sub-account decides:
- A sub-account **Admin** becomes the CRM `owner`, a sub-account **User** becomes `office`, on their first open of **CRM**. Nothing to approve.
- An **agency** login (for example opening the sub-account from the agency view) does **not** get in. Each client's CRM belongs to that business's own team. To test as a client, use a user of that sub-account, or **View client** on `/admin/clients`.
- Signed in once, the device stays signed in for 1 year, renewed while used. After that, `/sign-in` says "Sign in again with HighLevel. Use j•••@gmail.com." (the email used last time, masked), the button goes straight to that client's CRM page, and "Forgot that password? Reset it on the HighLevel login screen." An explicit sign-out clears that hint.
- Inside HighLevel, if the browser drops the CRM's sign-in (Safari often does), the page says "Your sign-in ended." with **Sign in again** and **Open the CRM full screen**. Never a blank page.

Messages on the CRM page when someone cannot get in (each has **Try again**):

| Message starts with | Cause | Fix |
|---|---|---|
| "You are signed in with an agency login." | The HighLevel login is an agency user | Use a user of that sub-account |
| "Your HighLevel user is not part of this business yet." | Not on the sub-account's user list | The owner adds them as a team member in HighLevel |
| "This CRM is turned off for this business." | Login turned off on `/admin/clients` | Turn on login |
| "This business is not connected to the CRM yet." | Client not connected or uninstalled | Run the Install steps |
| "Your access to this CRM is turned off." | That CRM user was turned off | Turn the user back on under **Users** |
| "Ask Forge Forward to fix this: your email is already linked to another CRM." | One email is one CRM account across all clients | Use another email for this business, or move the account |
| "We could not sign you in." | Anything else | Check Vercel logs for `embed_login denied reason=` (it also logs the HighLevel `type` and `role`) |

## Troubleshooting

To see a client's real data as a Forge Forward admin, use **View client** on `/admin/clients` (`docs/view-as-client-and-token-renewal.md`). Production also needs `CRON_SECRET` so tokens renew when nobody opens the app.

| What you see | Cause | Fix |
|---|---|---|
| `No integration found with the id` | Wrong install host or path | Set `GHL_INSTALL_BASE_URL` as above and redeploy |
| `Forbidden` on the start link | Not signed in as a CRM admin | Sign in as admin in the same browser |
| `Password has not been set for the user` | That HighLevel login has no password | Use "Forgot password?", then restart from the start link |
| Error after approving | The link expired, or a different browser or session was used | Restart from the start link |
| CRM page says "HighLevel did not answer" | The CRM menu item is an agency custom menu link, which gets no user context | Use the app's Custom Page as the CRM item (see "Owner access") |
| CRM page is blank on a white-label host | That host is not allowed to frame `/embed`, or the environment runs code from before 2026-11-24 | Check the list in `src/shared/config/frame-headers.ts` and that the environment is deployed |
| After "Install to more sub-accounts", no `{"installed":…}` page | Normal when the app is already installed | Check `/admin/clients`; the `INSTALL` webhooks connect them |
| Installed in HighLevel, but no client in the CRM, and **Continue** is greyed out | Install did not start from our link, so no agency token is stored | Uninstall the app from that sub-account, then run the Install steps from our link |
| Client shows `needs_reconnect` | HighLevel rejected the stored token | Run the Install steps again |
| Leads says it can't load | Missing env, HighLevel error or read limit | Check the Vercel logs for `HighLevel contacts read failed: step=` |
| CRM page says "Ask Forge Forward for access." | Code from before 2026-11-24 evening; the real reason is in the log line `embed_login denied reason=` (on 2026-11-24 it was `not_in_location`: an agency login) | Deploy current code; see "Who gets in" above |
| Settings save says "Database update pending" | A migration is not applied on this environment | Open `<site>/admin/migrations`; follow `docs/release-migrations.md` |
| Image change says "needs media permission" | The sub-account's token lacks `medias.*` | See "New app permissions (scopes) and re-approve" |
