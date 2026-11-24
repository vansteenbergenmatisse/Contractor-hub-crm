# HighLevel OAuth: facts read from the official docs (2026-11-21)

Read by a research agent from marketplace.gohighlevel.com. None of the pages shows a publication date. Treat as "as read on 2026-11-21". Re-check an endpoint before relying on a detail marked unverified. Base URL: `https://services.leadconnectorhq.com`. Authenticated calls send `Authorization: Bearer <token>`. Every request sends a `Version` header (published versions: `v3` latest, `2023-02-21`, `2021-07-28`, `2021-04-15`).

## Endpoints

1. **Code exchange and refresh**: `POST /oauth/token`
   - Reference page: `Version: v3`; body `application/x-www-form-urlencoded`: `client_id`, `client_secret`, `grant_type` (`authorization_code`, `refresh_token`, `client_credentials`), `code`, `refresh_token`, `user_type` (`Company` or `Location`), `redirect_uri`.
   - Response: `access_token`, `token_type`, `expires_in` (about 86399), `refresh_token`, `scope`, `userType`, `locationId` (sub-account only), `companyId`, `approvedLocations`, `userId`, `planId`, `isBulkInstallation`, `installToFutureLocations`, `approveAllLocations`.
   - Agency bulk token sample: `userType: "Company"`, `isBulkInstallation: true`, `companyId`, `userId`, no `locationId`.
2. **Location token from an agency token**: reference `POST /oauth/location-token`, `Version: v3`, scope `oauth.write`, agency token, form body `companyId` + `locationId`. Response: `access_token`, `token_type`, `expires_in`, `scope`, `locationId`, `userId`, `appId`, `versionId`, `refresh_token`.
3. **Locations where the app is installed**: `GET /oauth/installed-locations`, `Version: v3`, scope `oauth.readonly`, agency token. Query: `companyId` (required), `appId` (required), `pageSize` (1 to 100, default 20), `pageToken`, `isInstalled`, and others. Response: `items[]` (`_id`, `name`, `address`, `isInstalled`, `versionId`, `installedAt`), `pagination` (`hasNextPage`, `nextPageToken`, ...).

## Install and callback

- **Install URL (official `docs/oauth/Authorization.md`, read 2026-11-22):** standard flow `https://marketplace.gohighlevel.com/v2/oauth/chooselocation`; white-labeled flow `https://marketplace.leadconnectorhq.com/v2/oauth/chooselocation`. Both of our apps are listed as white-label and the stored INSTALL event has `isWhitelabelCompany: true`, so `GHL_INSTALL_BASE_URL` must be `https://marketplace.leadconnectorhq.com`. The older form without `/v2` and the `gohighlevel.com` host gave "No integration found" for the Test app on 2026-11-22; which of the two caused it is not proven.

- The install URL is copied from the app's Advanced Settings, Auth page. Docs mention `/oauth/chooselocation` and `/v2/oauth/chooselocation` and say `state` is returned unchanged. No other install URL parameter is documented.
- Callback carries `code` and `state`. Reject a missing or mismatched `state`; use a random, short-lived, single-use value; invalidate it before exchanging the code.
- Code expires after 5 minutes, single use. `redirect_uri` must match a registered URI exactly. PKCE is not supported.

## Tokens

- Access token about 24 hours (86,399 s; location samples show 86,400).
- Refresh token valid up to one year or until used; the guide says the refresh response includes a new refresh token. The reference page is silent on this.

## Rate limits

- Per app per resource: 100 requests per 10 seconds, 200,000 per day (defaults, can differ per app). Headers: `X-RateLimit-Limit-Daily`, `X-RateLimit-Daily-Remaining`, `X-RateLimit-Daily-Reset` (milliseconds), `X-RateLimit-Max`, `X-RateLimit-Remaining`, `X-RateLimit-Interval-Milliseconds`. A 429 has body `{"statusCode":429,"message":"Too Many Requests"}` and no `Retry-After`.

## Discrepancies between the pages (resolve by testing on staging, read-only)

1. Location token path: guide `/oauth/locationToken`, reference `/oauth/location-token`.
2. Location token `Version`: guide `2021-07-28`, reference `v3`.
3. `/oauth/token` content type: guide sample JSON, reference form-urlencoded. Use form-urlencoded (the build prompt says so too).
4. `expires_in` on location tokens: 86399 versus 86400. Compute expiry from the response value, never a constant.
5. Location token response: the guide includes `companyId` and `userType`; the reference list does not. Do not depend on them.

## Not stated anywhere that was read

- Error bodies and status codes for the token endpoints (invalid code, invalid or reused refresh token). Treat any non-2xx on refresh as a failure; the exact `invalid_grant` shape must be confirmed on staging.
- Required scopes for `/oauth/token`.
- The full `chooselocation` URL parameters beyond `state`. The build prompt lists `response_type`, `client_id`, `redirect_uri`, `scope`, `state`; this was not confirmed by the docs read.
- Whether a refresh response always rotates the refresh token.
- Any dated changelog for these endpoints.

# HighLevel webhooks: facts read from the official docs (2026-11-21)

Read by a research agent from marketplace.gohighlevel.com (WebhookIntegrationGuide, AppInstall, AppUninstall). No page shows a date. The Ed25519 public key below was also checked by Claude with `curl` and `grep` against the guide page: identical.

- **Headers**: `X-GHL-Signature` = Ed25519, "Current, use this when present". `X-WH-Signature` = RSA-SHA256, "Legacy", deprecated 1 Sep 2026 (already past); the code ignores it.
- **Encoding**: not stated in words; the guide's example does `Buffer.from(signature, 'base64')`, so base64.
- **What is signed**: "We sign the webhook body with our private key." The example verifies `JSON.stringify(req.body)`, not the raw bytes, and the docs never say raw bytes. So the code tries the raw body first, then the re-serialized JSON, and accepts either.
- **Public key (Ed25519, SPKI PEM, public)**: `MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=` (base64 body between BEGIN and END PUBLIC KEY).
- **INSTALL** (`type: "INSTALL"`): fields type, appId, companyId, locationId, userId, planId, trial, isWhitelabelCompany, whitelabelDetails, companyName. userId and companyId may be absent for installs via "future locations". An agency-level example has companyId and no locationId.
- **UNINSTALL** (`type: "UNINSTALL"`): schema is only type, appId, companyId, locationId. Location level: appId + locationId. Agency level: appId + companyId. No `webhookId` and no `timestamp` in either schema.
- **Retries**: any non-2xx or no response is retried up to 12 times with exponential backoff and jitter; stops on any 2xx. Timeout length not stated. The guide says to return 200 even on processing errors. A circuit breaker evaluates each URL about every 3 days (success rate below 90% with more than 10,000 webhooks flags it).
- **webhookId**: the guide says "store webhook IDs to prevent duplicate processing" but INSTALL and UNINSTALL schemas have none, and uniqueness per event versus per delivery is not stated. **Replay protection**: not stated, no timestamp tolerance.

# HighLevel users: facts read from the official docs (2026-11-21, ticket 6)

Read by a research agent from marketplace.gohighlevel.com/docs/ghl/users (search-users, users, filter-users-by-email). No page shows a date. Not yet seen on a real response.

- **Search Users** (the call the invite check uses): `GET /users/search`, `Version: v3`, scope `users.readonly`, auth OAuth or Private Integration. The page lists token types "Agency Token" and "Sub-Account Token"; whether a location token alone is accepted is not spelled out, so confirm on staging (read only).
- **Query**: `companyId` (required), `locationId`, `query` (name, email or phone term), `skip` (default 0), `limit` (default 25), `type`, `role`, `ids`, `sort`, `enabled2waySync`. No exact-email query parameter: the code searches with `query` and then compares the email itself.
- **Response 200**: `users[]` and `count`. Per user: `id`, `name`, `firstName`, `lastName`, `email`, `phone`, `permissions` (flags), `scopes`, `roles` (`type` "account" or "agency", `role` "admin" or "user", `locationIds[]`, `restrictSubAccount`), `deleted`. Error statuses: not stated on the page.
- **Filter Users by Email** (`POST`, body `companyId`, `emails`): agency token only. Not used.
- `get-user-by-location` does not exist as a docs page (the research agent got an empty shell).

# HighLevel user context for `/embed`: facts read from the official docs (2026-11-21, before ticket 7)

Read by a research agent (summarising fetch tool, so code samples are restored, not byte-exact). Sources: marketplace.gohighlevel.com/docs/2021-07-28/other/user-context-marketplace-apps, .../docs/marketplace-modules/CustomPages.md, .../docs/oauth/AppReviewGuidelines.md, help.gohighlevel.com article 48001185767 (custom menu links). Not yet seen on a real payload.

- **Handshake**: the iframe posts `{ message: "REQUEST_USER_DATA" }` to `window.parent` (sample target origin `"*"`), then listens for a `message` event with `data.message === "REQUEST_USER_DATA_RESPONSE"`. The encrypted string is `data.payload`. The event also carries an unsigned, unencrypted `region` copy: use the one inside the decrypted payload. No timeout, retry policy or `event.origin` allowlist is documented. Review guidelines section 6.3: an embedded app "must validate the parent frame" and must not trust client-side context alone for sensitive authorization.
- **Decrypt**: the documented backend code is `CryptoJS.AES.decrypt(encryptedUserData, sharedSecretKey).toString(CryptoJS.enc.Utf8)` then `JSON.parse`, secret from `GHL_APP_SHARED_SECRET`. **The docs do not state the format** (no key/iv, hex or base64, `Salted__`, MD5). A string secret in CryptoJS means passphrase mode (base64 OpenSSL blob, EVP_BytesToKey MD5, `Salted__` + 8-byte salt); that is Claude's inference from how CryptoJS works, not a HighLevel statement. Safest: the `crypto-js` package exactly as documented (a dependency: needs the user's approval), or `node:crypto` only after proving it against one real payload captured on staging. The Shared Secret is created in the app's Advanced Settings, Auth section. Decrypt on the backend only.
- **Decrypted fields**: agency sample `userId, companyId, role, type, userName, email, isAgencyOwner, region, versionId, appStatus, whitelabelDetails{domain, logoUrl}`; the location sample adds `activeLocation`. The location sample shows `type: "agency"` even with `activeLocation`, so detect sub-account context by `activeLocation` being present, not by `type`. Unknown keys will appear: ignore them. No expiry or timestamp field is documented, so replay protection is undocumented.
- **Framing**: pages render in an iframe; do not send `X-Frame-Options: DENY` or `SAMEORIGIN`; with CSP set `frame-ancestors` to allow HighLevel. **The docs name no parent origins**: `app.gohighlevel.com`, `app.leadconnectorhq.com` and the white-label domain in build prompt 4.5 are not confirmed by any page read. `whitelabelDetails.domain` hints that white-label domains exist.
- **Cookies**: the docs only say to verify cookies and sessions work in an embedded cross-site context. `SameSite=None; Secure` and `Partitioned` are not in the docs: test on staging.
- **Custom Page URL**: host externally over HTTPS; placement app details page or left menu; the query string may hold HighLevel variables like `{{user.first_name}}`; do not put sensitive values in the URL. The rule that URLs containing "ghl", "highlevel" or "leadconnector" are refused is not on any official page read (only a third-party thread about OAuth redirect URIs); keep the build prompt's rule anyway.
- **Unverified**: the exact encryption format, parent origins, third-party cookie behaviour, the URL-word rule for Custom Pages, replay protection, whether `type` is reliably `location`, HighLevel's `/decrypt-sso` GitHub template, stoplight.io.

# HighLevel read endpoints for Phase 3: facts read from the public docs (2026-11-22)

Sources: OpenAPI repo `GoHighLevel/highlevel-api-docs` at commit `0af86a4` (2026-06-19, HEAD on that date), `marketplace.gohighlevel.com/docs/ghl/<area>/<page>`, and help article 155000009502 (workflows). No live call was made and no real response has been seen. "Not stated" means the sources read do not say. All scopes below are already in `scopes.ts`; which scopes are enabled on the Marketplace app was not checked. The docs list a Sub-Account (Location) token for all of these.

| Endpoint | Scope | Required input | Paging and last page |
|---|---|---|---|
| `POST /contacts/search` | `contacts.readonly` | `locationId`, `pageLimit` (max 500) | `page × pageLimit` up to 10,000. With `searchAfter`, an empty `contacts` array is the end. `hasMore: false` is not proof at the 10,000 window |
| `GET /contacts/{contactId}` | `contacts.readonly` | path | n/a |
| `GET /opportunities/search` | `opportunities.readonly` | `locationId` | `limit` max 100. `meta.nextPage` is empty on the last page. Past 10,000 use `meta.startAfter` + `startAfterId`, never combined with `page` |
| `GET /opportunities/pipelines` | `opportunities.readonly` | `locationId` | none documented |
| `GET /conversations/search` | `conversations.readonly` | `locationId` | `limit`, `startAfterDate`. Last-page proof not stated |
| `GET /conversations/{id}/messages` | `conversations/message.readonly` | path | `lastMessageId`. `nextPage: false` ends it; `true` means more "may" exist |
| `GET /calendars/` | `calendars.readonly` | `locationId` | none documented |
| `GET /calendars/events` | `calendars/events.readonly` | `locationId`, `startTime`, `endTime` (ms), one of `calendarId`, `userId`, `groupId` | Not stated, so completeness cannot be proven |
| `GET /calendars/{id}/free-slots` | `calendars.readonly` | `startDate`, `endDate` (ms, max 31 days) | not paged |
| `GET /invoices/` | `invoices.readonly` | `altId`, `altType=location`, `limit`, `offset` | top-level `total` |
| `GET /invoices/estimate/list` | `invoices/estimate.readonly` | same as invoices | top-level `total` |
| `GET /payments/transactions` | `payments/transactions.readonly` | `altId`, `altType` | `limit`, `offset`, `totalCount` |
| `POST /workflows/search` | `workflows.readonly` | `locationId` | `searchAfter` absent means last page. 403 `WORKFLOW_API_NOT_ENABLED_FOR_LOCATION` when not enabled |

`GET /contacts/` is deprecated; do not use it. `GET /workflows/` is marked deprecated in the docs sidebar, with no replacement or sunset stated.

**Lead fields.** Search answers `contactName` and `address`; the single contact answers `name` and `address1`. Both documented: `firstName`, `lastName`, `email`, `phone`, `city`, `state`, `postalCode`, `source`, `tags`, `dateAdded`, `dateUpdated`, `lastActivity`, `attributionSource`, `lastAttributionSource`. `source` values are free strings; no mapping to labels such as Google or Facebook is documented. Opportunity: `name`, `monetaryValue`, `pipelineId`, `pipelineStageId`, `status`, `source`, `contactId` (nullable), `lastStageChangeAt`, `createdAt`, `updatedAt`.

**Minutes waiting.** No documented field holds the first inbound message. It can only be derived by scanning a contact's conversations and messages, or by storing the `InboundMessage` webhook (needs a backfill). Message sort order and a per-message automated flag are not stated.

**Other fields.** Conversation answers have `lastMessageBody`, `lastMessageType` and `unreadCount`, but no last-message date or direction. Invoice and transaction amount units are not stated. The estimate list item shape is not stated (typed `string[]`).

**Workflows can only be changed on allowlisted sub-accounts.** Status and definition writes are a private beta, requested through HighLevel Support. `PUT /workflows/{id}/status` takes `published` or `draft`; there is no separate on/off. `PUT /workflows/{id}/definition` works on drafts only and overwrites the whole workflow, so an omitted step is deleted. The effect of a draft switch on enrolled contacts was not confirmed.

**Contact search as built (P3-2, 2026-11-22).** `POST /contacts/search` with `Version: v3` and body `{ locationId, page: 1, pageLimit: 100, sort: [{ field: "dateAdded", direction: "desc" }] }`. The live docs list `dateAdded` as a sort field and `asc`/`desc` as directions; the OpenAPI v3 file leaves the body schema empty. The older OpenAPI file names Version `2021-07-28` for this path. Paging is read from `total` or `count` and `hasMore`.

**Live shape check: not done.** The Neon `develop` database holds one tenant, it is not the test sub-account, and it has no stored HighLevel connection, so no contact search was sent. Which `Version` works, the real response keys, the type of `address`, the paging fields and the sort behaviour are all **unconfirmed**. The parser therefore requires only `id` and a readable `dateAdded`, and reads a wrongly typed optional field as missing.

**Inbox reads as built (2026-11-22). Response shape UNVERIFIED.** Built from the OpenAPI file `apps/conversations.json` at commit `0af86a4`; no live call was made and the test fixtures are written from that file. `GET /conversations/search` (scope `conversations.readonly`) with `locationId`, `limit=50`, `sort=desc`, `sortBy=last_message_date`. `GET /conversations/{id}/messages` (scope `conversations/message.readonly`) with `limit=50`. Both send `Version: 2021-04-15`, the only value that file lists. The limit of 50 is a proposal: no maximum is stated. Unconfirmed: the working `Version`, the messages nesting (both forms are parsed), message order (sorted by `dateAdded` here), whether the first page holds the newest messages, and whether the scopes are enabled on the Marketplace app. The conversation row documents no last-message date or direction, so the page shows no wait time and no "needs reply". Phone and email on the row are not carried. Outbound messages read "Sent" because the meaning of `source` is not documented. Activity and internal-comment types are left out of the thread. An admin's client view uses the stored token only and its own rate-limit key.

**Calendar read as built (2026-11-22). Response shape UNVERIFIED.** Source: OpenAPI files `apps/calendars.json` and `apps/locations.json` at commit `0af86a4`. No live call was made; the test fixtures are built from those files, so they prove the parser matches the docs, not that the docs match HighLevel.

- Calls, all `GET`, in this order per page load: `/locations/{id}` (`Version: 2021-07-28`, scope `locations.readonly`, field `location.timezone`), `/calendars/?locationId=` (`Version: 2021-04-15`, scope `calendars.readonly`), then `/calendars/events?locationId&calendarId&startTime&endTime` once per calendar (`Version: 2021-04-15`, scope `calendars/events.readonly`, times in ms). The three scopes are in `scopes.ts`; whether they are enabled on the Marketplace app was not checked.
- Calendar ids are looked up per tenant on every read. A read covers at most 25 calendars and 500 events per calendar (proposals, not measured). A calendar that fails fails the whole week, so a gap never looks like free time.
- **Unverified:** the real response keys; whether `startTime`/`endTime` are strings with an offset (the file types them `object` with a string example; a string without an offset is dropped, a number is read as ms); whether events overlapping the range edges are returned; whether the events list is paged or capped (not stated, so completeness cannot be proven); whether `showDrafted` (default `true`) matters for existing appointments; which `appointmentStatus` values really occur (`cancelled` and `invalid` are hidden).
- **Not available from these endpoints:** whether an appointment is an estimate or a job, so each shows as "Appointment". Working hours are not read and no free times are shown.

**Sources disagree on (confirm on a real response):** `Version` (`v3` on the live docs, `2021-07-28` or `2021-04-15` in the older OpenAPI files); opportunity search parameter names (`locationId` vs `location_id`, `query` vs `q`); messages nesting (`messages.messages[]` vs top-level `messages[]`); error statuses; some types versus examples (`invoiceNumber`, `startTime`, transaction `status`).

**Pipeline read as built (2026-11-22). Response shape UNVERIFIED.** No live call was made: no credentials exist locally. Fixtures are built from the public OpenAPI file `apps/opportunities.json` at commit `0af86a4`. GET only.

- `GET /opportunities/pipelines?locationId=`, `Version: 2021-07-28`, scope `opportunities.readonly`. Reads `pipelines[].id`, `name`, `locationId`, `stages[]`.
- `GET /opportunities/search?location_id=&pipeline_id=&status=open&page=&limit=100`, `Version: 2021-07-28`, scope `opportunities.readonly`. Reads `opportunities[]` (`id`, `name`, `locationId`, `pipelineId`, `pipelineStageId`, `status`, `monetaryValue`, `lastStageChangeAt`, `contact.name`) and `meta.total`, `meta.nextPage`. Contact phone and email are in the answer and are dropped by the parser.
- **Unverified on a real answer:** the stage item shape (the OpenAPI types `stages` as an array of arrays; the code expects objects with `id`, `name` and optional `position`), whether the live API wants `location_id` or `locationId`, whether `v3` is also accepted, the `meta` paging behaviour, and the unit and currency of `monetaryValue` (shown as a plain number, zero hidden).
- **Scopes:** `opportunities.readonly` is in `scopes.ts`. Whether it is enabled on the Marketplace app was not checked. `pipelines.readonly` is also in `scopes.ts`, but the OpenAPI file does not ask for it on these paths.
- **Limits (proposals, not measured):** 3 pages of 100 per load, then the page says the list is cut off; 60 loads per minute per tenant; 5 MiB per response. Only `open` deals are read, so a deal marked won or lost in HighLevel does not appear in any stage.
- **Admin client view:** uses `withStoredLocationToken` (no refresh) and the limiter key `highlevel-pipeline-view:<viewerId>`.
- **Off switch:** `PIPELINE_READ_DISABLED=true`.

**Custom value write-back as built (2026-11-22). Response shape UNVERIFIED, no live call made.** Source: `apps/locations.json` at commit `0af86a4`. `PUT /locations/{locationId}/customValues/{id}`, `Version: 2021-07-28`, body `{ name, value }`, both required; documented 200, 400, 401, 422. The file lists no scope on the PUT; `locations/customValues.write` is on the POST and in our scope list. Unconfirmed: whether a stored token holds that scope, the real answer, the rate limit, and whether a change fires anything in HighLevel. Rules and rollback: `openspec/changes/settings-write-back/proposal.md`.

# New sub-account auto-connect: facts read from the public docs (2026-11-24)

Read with a summarising fetch tool from `marketplace.gohighlevel.com/docs/webhook/AppInstall.md`, `.../webhook/LocationCreate.md`, `.../webhook/WebhookIntegrationGuide/index.html`, `.../docs/ghl/oauth/get-installed-location.md` and `.../docs/ghl/oauth/get-location-access-token.md`, plus the GitHub copy of AppInstall. No page shows a date. No live call was made.

**Confirmed by the docs:**
- INSTALL: "The User ID and Company ID may be available when a new token is generated." and "In case of app installation via future locations, you may not get these fields." So a future-location INSTALL may lack `companyId` (handled since 2026-11-22).
- LocationCreate: "Available only to Agency Level Apps". Schema: `type`, `id` (the new location), `name`, `email`, `stripeProductId`, `companyId`. No `appId`, no `locationId`, no `webhookId`.
- Webhook events are switched on per event in the app's Advanced Settings, webhook section ("Turn on and paste your webhook URL against the events you wish to receive"). LocationCreate is listed under Location Events. Subscriptions can be changed at any time.
- Retries: any non-2xx or no response is retried up to 12 times with exponential backoff and jitter. The timeout is not stated.
- `GET /oauth/installed-locations` (`Version: v3`, agency token, `oauth.readonly`): query `companyId` and `appId` required, `pageSize` 1 to 100 (default 20), `pageToken`, `isInstalled`, `locationId`, `query`, `versionId`, `onTrial`, `planId`, `restrictToUserLocations`. Response `items[]` (`_id`, `name`, `address` required; `isInstalled`, `versionId`, `installedAt` optional), `pagination` (`hasNextPage`, `hasPrevPage`, `currentPageSize` required; `nextPageToken` and others optional), and an optional `installToFutureLocations` boolean. The page notes that without `restrictToUserLocations` "the install list (`isInstalled=false`) is still user-filtered".
- `POST /oauth/location-token` (`Version: v3`, agency token, `oauth.write`), body `companyId` + `locationId`. The OpenAPI spec says form-urlencoded; the page's code samples send JSON (the docs disagree). Response `access_token`, `token_type`, `expires_in`, `scope`, `locationId`, `planId`, `userId`, `appId`, `versionId`, `refresh_token`. Errors 400, 401, 422.

**Not stated anywhere read (unproven until a real new sub-account is created):**
- Whether HighLevel sends an INSTALL webhook at all for a sub-account added through "future locations", and how long after LocationCreate.
- How soon a new sub-account appears in `/oauth/installed-locations` after it is created.
- Whether `/oauth/location-token` fails for a location the app is not (yet) installed on, and with which status.
- Whether `installToFutureLocations` is really sent, and whether "Select all" on the install screen sets it.
- Whether loading a snapshot carries the app (no page read says so).

**How the code uses this (2026-11-24):** INSTALL (with or without `companyId`) and LocationCreate both connect a location only when our agency's `/oauth/installed-locations` list (asked with our `appId`) names it; not listed yet answers 500 so HighLevel retries. A LocationCreate whose location is not listed and whose agency reports `installToFutureLocations: false` is acknowledged without retries. The reconcile (daily cron on production, an admin opening `/admin/clients` at most once per 5 minutes per agency, and the "Check for new sub-accounts" button) connects any listed location the webhooks missed.

# Sign in with HighLevel and the jump to full screen: facts read from the public docs (2026-11-24)

Sources read in this session: help.gohighlevel.com article 48001185767 (custom menu links), marketplace.gohighlevel.com/docs/marketplace-modules/CustomPages, and search results over marketplace.gohighlevel.com/docs/ghl/custom-menus/*. The user context handshake is in the `/embed` section above.

**Confirmed (stated on a page read):**
- A custom menu link is made in agency Settings > Custom Menu Links: icon, title, URL (must start with `http://` or `https://`), sidebar (agency, sub-account or both; for sub-accounts you pick which ones), role visibility (All, User, Admin).
- "Open in" has three choices: Embedded Page (iFrame), New Browser Tab, Current (Browser) Tab. The custom menus API names them `openMode`: `iframe`, `new_tab`, `current_tab`. Current Tab moves the HighLevel tab away from HighLevel.
- The link URL (our side) may hold placeholders HighLevel fills on click: `{{location.id}}`, `{{location.name}}`, `{{user.email}}`, `{{user.first_name}}`, `{{location_owner.email}}`, `{{custom_values.<name>}}`; location and custom values only in a sub-account sidebar. The article warns these values end up in history and logs. We do not use them: identity comes only from the encrypted user context.
- Custom Pages (marketplace app) render in an iframe; the host must allow framing (`frame-ancestors`), and cookies must be checked in a cross-site iframe.

**Not stated on any page read (unknown until the live test):**
- The address of the CRM page INSIDE a sub-account (what the address bar shows after clicking the menu item). It is often seen as `https://<highlevel-host>/v2/location/<locationId>/custom-menu-link/<menuLinkId>` (or `.../custom-page-link/<id>` for a marketplace custom page), but no official page states it. The code does not hard-code it: the operator copies it once into `HIGHLEVEL_CRM_MENU_URL` with the sub-account id replaced by `{locationId}`.
- Whether an agency custom menu link opened as an iframe answers `REQUEST_USER_DATA` like a marketplace Custom Page. The docs describe the user context for marketplace apps only. If it does not answer, `/embed` shows "HighLevel did not answer", and the CRM menu item must be the marketplace app's Custom Page instead.
- The iframe's `sandbox` attributes (`allow-top-navigation`, `allow-top-navigation-by-user-activation`, `allow-popups`). So it is not known whether `/embed` may move the whole tab (`window.top.location`) or open a new tab. Browsers also stop a cross-origin frame from moving the top window without a tap. The code tries once and always shows "Open full screen" (target `_top`) and "Open in a new tab" (target `_blank`) for a tap.
- Third-party cookies in the iframe (Safari blocks them). The full-screen path does not need them: the handoff token comes back in the `/api/auth/embed-login` response body, and the new session is set first-party on `/device-sign-in`.

**Choice made (reversible):** one env value, `HIGHLEVEL_CRM_MENU_URL`, a template with `{locationId}`. An agency-level custom menu link has one id for every sub-account it is shown in (Claude's reading of "one link, pick the sub-accounts"; not stated outright), so one template covers every client, and a white-label host works the same way. A per-tenant admin field was not chosen: it needs a new table (migration) and a paste per client for a value that should be the same everywhere. If the live test shows the id differs per sub-account, switch to a per-tenant value then.
