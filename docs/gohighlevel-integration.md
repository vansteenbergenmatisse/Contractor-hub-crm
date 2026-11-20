# GoHighLevel (HighLevel) integration plan

Status: **planned, nothing built.** No HighLevel code exists in the repo. Written 2026-11-20 from web research (partly third-party guides). The official docs at https://marketplace.gohighlevel.com/docs are the authority; verify the items under "Unverified" before building.

Goal: clients log in to our CRM, and we can read and act on their HighLevel sub-account (location) data, only their own.

## How access works

- A HighLevel **Marketplace app** (OAuth 2.0) is the route for many clients. A **Private Integration token** is a long-lived secret for one account you administer: fine for testing on our own account, not for many clients.
- Token types: an **agency (company) token** cannot read contacts directly; it is used to mint a **location token** per sub-account (needs agency-level scopes and the app set up as an Agency app). A sub-account user who installs the app gets a location token directly.
- HighLevel does not log our clients in. Our CRM does. We map each CRM user to a tenant, and each tenant to a `locationId` and its stored token.
- Alternative (not chosen yet): embed the CRM as a HighLevel custom page and decrypt the user context HighLevel passes (needs the app's shared secret). No documented way found to pass this into Custom Menu Link iframes.

## Phases

### Phase 0: decisions (user)
1. Login model: own site (assumed) or embedded in HighLevel.
2. Auth method and library (email+password, magic link, Google).
3. Who installs: agency installs once and we mint per-location tokens, or each client authorizes.

### Phase 1: HighLevel app (user)
1. Create a Marketplace app in the HighLevel developer portal.
2. Distribution: "Agency & sub-account".
3. Choose scopes (depends on CRM scope).
4. Register one redirect URI per environment (Vercel domains for develop, staging, main). The URI sent at token exchange must match exactly.
5. Put client ID and client secret (and shared secret if embedding) in `.env.local` and the Vercel environment variables. Never paste them in chat or commit them. Variable names to agree before use.

### Phase 2: build (Claude, after phase 1)
1. Tables: tenants, CRM users, HighLevel connections (`locationId`, encrypted tokens, expiry). Migrations via develop, then staging, then main.
2. Login tied to a tenant.
3. Connect route: redirect to HighLevel `chooselocation`, callback exchanges the code at `services.leadconnectorhq.com/oauth/token`.
4. Token handling: refreshing invalidates the old refresh token, so use a lock against concurrent refresh. Location tokens minted from an agency token reportedly have no refresh token; mint again on expiry.
5. Access check: every HighLevel call resolves the token from the logged-in user's tenant. Never accept a `locationId` from the browser.
6. API client with retries and backoff; tests.

### Phase 3: onboarding one client
1. Create or confirm their sub-account.
2. Create their CRM login or send an invite.
3. Client logs in, clicks "Connect GoHighLevel".
4. Client picks their sub-account and approves the scopes.
5. Redirect back; we exchange the code, store tokens, link tenant to `locationId`.
6. Confirm a real record shows up.
7. If installing at agency level: authorize once, mint a location token per sub-account, skip steps 3-4; still confirm each client agreed to share data.

### Phase 4: ongoing
Refresh or re-mint tokens automatically; "reconnect" prompt if a client revokes; respect rate limits; webhooks if HighLevel should push changes.

## Unverified (check in the official docs first)

- `user_type` values (Company vs Location) in the token request.
- Token lifetimes (one guide: access ~24h, refresh ~1 year or until used).
- Whether agency-level access needs a specific plan (e.g. Agency Pro); sources conflict.
- Rate limits (one third-party source: 100 requests per 10 seconds, 200,000 per day).
- Token caps for Private Integrations (sources say 5 or 20).
- Anything from the official OAuth page found in search, which looked old.

## Sources

- https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/
- https://marketplace.gohighlevel.com/docs/other/user-context-marketplace-apps.md
- https://marketplace.gohighlevel.com/docs/marketplace-modules/CustomPages.md
- https://help.gohighlevel.com/support/solutions/articles/155000002141-marketplace-app-distribution-type
- https://github.com/malikyousaf-0/gohighlevel-oauth-starter
- https://apidevx.com/gohighlevel-oauth-integration-how-to-connect-any-external-software-step-by-step-when-to-hire-it-out/
- https://autogencrm.com/gohighlevel-api/
- https://hamzaautomations.com/blog/gohighlevel-oauth-vs-private-integration
