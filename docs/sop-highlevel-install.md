# SOP: install the HighLevel app and add clients

Written 2026-11-22 from the code, `docs/greenlane/build-prompt.md` and that day's install attempts.

**Status: the install from our link worked on dev for JCR on 2026-11-22.** Staging and production have not been installed. Steps marked **(not proven)** have not been run for real. After the first success in each environment, remove the mark or correct the step. A snapshot may not carry the app, so assume each new sub-account needs the Install steps.

## The short version

- **You do not install per sub-account.** The intended setup is one install per environment, from the agency, with "all sub-accounts" selected in production.
- **A new client should then appear by itself (not proven).** Tick **"Select all N sub-accounts"** on HighLevel's install screen. HighLevel then sends an `INSTALL` event for each new sub-account, and the app creates the client and its users, even when the event has no company id. A daily sync at 05:00 UTC is the backstop. `/admin/clients` has a **Connect sub-accounts** button that opens the install link.
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

1. Create the sub-account in HighLevel and load the JCR snapshot.
2. Set the sub-account's email and fill in its custom values (`docs/tenant-branding.md`).
3. Add the client's users in HighLevel.
4. Check `/admin/clients` on production. The client should appear as **Connected (not proven)**.
5. If it is missing after a few minutes, check that the app is installed on that sub-account in HighLevel. The daily sync also emails `ADMIN_ALERT_EMAIL` about sub-accounts without the app.
6. If the app is missing, repeat the Install steps from our link and include the new sub-account.
7. Send the client their personal sign-in link from `/admin/clients`.

On dev and staging, a new test sub-account is not picked up automatically because only selected accounts have the app. Repeat the Install steps and select it.

## Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| `No integration found with the id` | Wrong install host or path | Set `GHL_INSTALL_BASE_URL` as above and redeploy |
| `Forbidden` on the start link | Not signed in as a CRM admin | Sign in as admin in the same browser |
| `Password has not been set for the user` | That HighLevel login has no password | Use "Forgot password?", then restart from the start link |
| Error after approving | The link expired, or a different browser or session was used | Restart from the start link |
| Installed in HighLevel, but no client in the CRM, and **Continue** is greyed out | Install did not start from our link, so no agency token is stored | Uninstall the app from that sub-account, then run the Install steps from our link |
| Client shows `needs_reconnect` | HighLevel rejected the stored token | Run the Install steps again |
| Leads says it can't load | Missing env, HighLevel error or read limit | Check the Vercel logs for `HighLevel contacts read failed: step=` |
