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

**Sources disagree on (confirm on a real response):** `Version` (`v3` on the live docs, `2021-07-28` or `2021-04-15` in the older OpenAPI files); opportunity search parameter names (`locationId` vs `location_id`, `query` vs `q`); messages nesting (`messages.messages[]` vs top-level `messages[]`); error statuses; some types versus examples (`invoiceNumber`, `startTime`, transaction `status`).
