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
