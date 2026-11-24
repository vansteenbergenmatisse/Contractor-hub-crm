# SOP: install the HighLevel app and add clients

Written 2026-11-22 from the code, `docs/greenlane/build-prompt.md` and that day's install attempts.

**Status: the install from our link worked on dev for JCR on 2026-11-22.** Staging and production have not been installed. Steps marked **(not proven)** have not been run for real. After the first success in each environment, remove the mark or correct the step. A snapshot may not carry the app, so assume each new sub-account needs the Install steps.

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

In the HighLevel developer portal, open the app, then **Advanced Settings**, then **Webhooks**. Set the webhook URL to `<site>/api/integrations/webhooks` and switch on: `INSTALL`/`UNINSTALL` (app events, if listed), **LocationCreate**, LocationUpdate, UserCreate, UserUpdate, UserDelete. Without LocationCreate, a new sub-account connects only through its INSTALL event or the reconcile.

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
5. You land on a plain page on our site, such as `{"installed":1,"failed":0}`.
6. Open `<site>/admin/clients` and confirm each client shows **Connected**.
7. Open the client's Leads page and confirm its own leads show.

### Environment notes

- **Dev and test accounts:** select only the test sub-account. JCR Landscaping is a real client and stays read-only.
- **Staging:** first set `GHL_APP_ID` to the Test app id. It was found pointing at the live app on 2026-11-21. Then point the Test app's webhook URL at staging.
- **Production:** test any pending migration on a Neon branch first. CI applies it on merge to `main`. Selecting all sub-accounts creates CRM accounts for all their users, so confirm the mail setting first.

## Add a new client (after the install)

Updated 2026-11-24 (branch `integrate/onboarding`, not yet merged into `develop`).

**How a new sub-account gets connected (the reconcile).** Four ways in, all of which connect a sub-account only when HighLevel's installed list for our agency (queried with our app id) names it. The agency's other sub-accounts are never connected.
- The `INSTALL` webhook, with or without a company id.
- The `LocationCreate` webhook (switch it on, see "Webhook events"). If the new sub-account is not in the installed list yet, the app answers 500 so HighLevel retries. If HighLevel says `installToFutureLocations` is false, it answers 200 and creates nothing.
- A background check each time an admin opens `/admin/clients`, in every environment: at most once per 5 minutes per agency, no admin emails. It also re-reads the users of known clients (deactivations, and set-password mails when `ONBOARDING_SEND_SET_PASSWORD=true`).
- The **Check for new sub-accounts** button on `/admin/clients` (admin only, 3 per minute per admin, new sub-accounts only). It reports how many it connected.
- The daily sync at 05:00 UTC still runs, on production only.

**Steps, from new sub-account to owner signed in:**
1. Create the sub-account in HighLevel and load the JCR snapshot.
2. Set the sub-account's email and fill in its custom values (`docs/tenant-branding.md`).
3. Add the client's users in HighLevel (the owner as a sub-account admin becomes our `owner`).
4. Open `/admin/clients`. The background check runs on that visit. If the client is not there, click **Check for new sub-accounts**, then reload.
5. If it is still missing, the app is not installed on that sub-account. Check in HighLevel, then repeat the Install steps from our link and include it. The daily sync (production) also emails `ADMIN_ALERT_EMAIL` about sub-accounts without the app.
6. The client row shows the CRM tenant id with **Copy id**. Use it for the per-client flags in Vercel (`docs/onboarding.md`, `.env.example`).
7. Give the owner a password. Either:
   - **Automatic:** with `ONBOARDING_SEND_SET_PASSWORD=true`, every new HighLevel user gets a "set your password" email when the account is created (24-hour link, at most 50 per client per day). Leave it off wherever the JCR owner could be emailed.
   - **By hand:** click **Users** on the client row. It lists the client's users and whether they signed in. **Send sign-in email** (for people who never signed in) makes a fresh 24-hour set-password link, emails it if the email guard allows, and always shows the link with **Copy link**. The page says exactly when the email was held back, the daily limit was hit or the email service refused it. Only the newest link works, so a second click cancels the first email's link.
   - **Invite owner** on an email that already has a never-used account in the same client now returns a set-password link instead of `email_taken`. A used account gets "ask them to use Forgot password"; a turned-off or removed account gets "login is turned off".
8. The owner opens the link, sets a password and signs in at `<site>/sign-in`. **Forgot password** on the sign-in page works for synced users too (24-hour link).

**Email env vars (names only):** `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_DELIVERY_MODE` (`allowlist` or `live`), `EMAIL_ALLOWED_RECIPIENTS` (allowlist mode), `APP_URL`, and `ONBOARDING_SEND_SET_PASSWORD=true` only if the sync should mail new users itself. Keep dev on `allowlist`: in `live` mode **Send sign-in email** for the JCR owner would really email them.

**Not proven yet (no real new sub-account has been tried):**
- whether a sub-account added through "future locations" gets an `INSTALL` event at all, and how late;
- how soon it appears in `/oauth/installed-locations`, and whether minting its token fails before the install finishes;
- whether `installToFutureLocations` is really sent, and the real `LocationCreate` payload;
- whether a snapshot carries the app;
- that a real email arrives (no mail was sent; the Resend From domain is unchecked);
- the button, the Users panel and the background check in a browser (component tests only).
- **Invite owner** on an existing account is not under the 50-per-day client cap (only the per-admin invite limit). An account made before the `UnusedAccountMarker` migration can't be proven unused, so it gets no admin link; that person uses Forgot password.

On dev and staging, a new test sub-account is picked up only if the app is installed on it (the Test app install selects only the test account). Repeat the Install steps and select it, or install with "Select all" after the user approves creating CRM accounts for the agency's other sub-accounts.

## Troubleshooting

To see a client's real data as a Forge Forward admin, use **View client** on `/admin/clients` (`docs/view-as-client-and-token-renewal.md`). Production also needs `CRON_SECRET` so tokens renew when nobody opens the app.

| What you see | Cause | Fix |
|---|---|---|
| `No integration found with the id` | Wrong install host or path | Set `GHL_INSTALL_BASE_URL` as above and redeploy |
| `Forbidden` on the start link | Not signed in as a CRM admin | Sign in as admin in the same browser |
| `Password has not been set for the user` | That HighLevel login has no password | Use "Forgot password?", then restart from the start link |
| Error after approving | The link expired, or a different browser or session was used | Restart from the start link |
| Installed in HighLevel, but no client in the CRM, and **Continue** is greyed out | Install did not start from our link, so no agency token is stored | Uninstall the app from that sub-account, then run the Install steps from our link |
| Client shows `needs_reconnect` | HighLevel rejected the stored token | Run the Install steps again |
| Leads says it can't load | Missing env, HighLevel error or read limit | Check the Vercel logs for `HighLevel contacts read failed: step=` |
