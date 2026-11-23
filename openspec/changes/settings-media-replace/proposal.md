# Proposal: Replace a client's image from Settings

Status: **built-off**. Built and tested against a mocked HighLevel only, off by default. No live HighLevel call, upload, Marketplace, Vercel or database change has been made.

## User decision (2026-11-23): "Upload and update"

This replaces the earlier same-URL requirement. Settings compresses the image, uploads it as a NEW file to the client's HighLevel media library, then points the custom value at the new URL through the existing save rules. The old file is never deleted or changed.

Why the same-URL route was dropped: the public API documents no way to replace an image's content in place (`apps/medias.json`, `apps/v3/medias-v3.json`), and private HighLevel endpoints are not an accepted route.

## As built

- `POST /api/settings/media`, owner only. Needs `SETTINGS_MEDIA_REPLACE_ENABLED` and `SETTINGS_MEDIA_REPLACE_TENANTS`, and also the write-back flags for the tenant, because the last step is a normal Settings save.
- SVG parser: `@xmldom/xmldom` 0.9.12, pinned, no dependencies and no install scripts.
- Stricter than a typical export: the SVG allowlist has no `style` element, gradients, `use`, masks or clip paths, because each needs `url()` or a reference. Such a logo is refused with a message, never changed silently.
- Audit: no new table and no migration. Each upload writes a `CustomValueChange` row first, with `newValue` `upload:<key>-<sha256-12>`. **That row records a file, not a value change, so it is not a rollback target.** The row of the PUT that follows holds the previous and new URL. The file id is not stored.
- Time limits (proposals, not measured): no upload starts after 15 seconds and no PUT after 35, inside the route's 60 seconds.
- Hosts: `files.leadconnectorhq.com` is added to the logo and preview defaults. Its files have no extension, so the background rule also accepts a last path segment with no dot on that host only. A named video or page is still refused.

**Known limits, not verified live:**

- The OpenAPI example upload URL is on `storage.googleapis.com`, which is not allowlisted. If real uploads answer with that host, every change stops at `bad_host` with the old value live, until the user approves that host through `LOGO_HOST_ALLOWLIST`.
- A browser with no canvas WebP encoder gets a clear message instead of an upload. Which phones this affects, Safari on iPhone especially, is not tested.
- The list call's `sortBy=createdAt` and `type=file` values, the `Version` value (`v3` is sent), and whether HighLevel keeps the bytes unchanged. If it alters them, a repeat of the same image stops at `hash_mismatch`.

## Why

User request (2026-11-23): replace a client's image from Settings, compressed to WebP in the browser and changed in the HighLevel media library. Logos and favicons are SVG only.

## Contract

Source: `GoHighLevel/highlevel-api-docs@0af86a4`. No live call made.

| Call | Scope | Request | Response |
|---|---|---|---|
| `POST /medias/upload-file` | `medias.write` | multipart `file`, `name`, `parentId` | `{fileId,url}` |
| `GET /medias/files` | `medias.readonly` | requires `sortBy`, `sortOrder`, `type`, `altType`, `altId` | file list |

- Limit: 25 MB in the API docs, 100 MB on the help page. Use the lower.
- `Version`: `v3` in `apps/v3/medias-v3.json`; the older file lists `2021-07-28`. The sandbox settles which works.
- The docs show no way to replace an image's content in place. "Change" means: upload new, repoint the custom value, keep the old file (user decision above).
- `DELETE /medias/{id}` and `POST /medias/{id}` (rename) are never called.
- Error cases: 400, 401, 403, 413, 422, 429, 5xx, timeout, malformed body, unapproved URL host.

**Unverified:** upload URL host and shape, CDN content type for SVG, whether HighLevel sanitizes or alters bytes, deleted-URL behavior, cache, media rate limits, idempotency, list filtering by name, and list freshness after upload.

## Design

- `highlevel/api/media-write.ts` holds the vendor calls. `settings-write-back` orchestrates on the server. Owner only, never View as client. Tenant and `locationId` come from the session.
- Separate flags, off by default: `SETTINGS_MEDIA_REPLACE_ENABLED` and `SETTINGS_MEDIA_REPLACE_TENANTS` (no wildcard).
- **Raster:** browser canvas compresses to WebP, no dependency. Proposed limits: longest side 2400 px, 2 MB. Vercel's request body limit is not checked. The server re-checks bytes, type and size and trusts nothing from the browser.
- **SVG (`business_logo`, `business_favicon_url`):** at most 512 KB, the existing logo fetch cap. Parse with an element and attribute allowlist. Reject script, `foreignObject`, `on*` attributes, external refs, DOCTYPE/entities and CSS `url()`.

| SVG option | For | Against |
|---|---|---|
| Vetted sanitizer | Maintained rules | Rewrites the owner's file silently; likely needs a server DOM |
| Strict rejecting parser on a vetted XML library | Small surface, nothing changed silently, clear refusal | Rejects some valid SVGs; still one dependency |

**Recommendation:** strict rejecting parser on a vetted XML library, uploading the serialized parsed tree so the stored bytes are what the allowlist checked. No hand-written XML parser. The package is named at the dependency gate.

## Sequence and idempotency

1. Validate. Compute the name `<key>-<sha256-12>`.
2. Look the name up. A name match is not proof: fetch the file through the limited fetcher and compare the hash. On a mismatch, stop.
3. Upload only if missing. **No blind upload retry.** On no answer, re-read first. If still absent, report `unknown`, because the list may lag.
4. Verify the URL host against the allowlist (`assets.cdn.filesafe.space` plus `LOGO_HOST_ALLOWLIST`). If it fails, stop before the PUT and never widen the list automatically.
5. PUT the custom value through the existing save rules (lease, stale check, no PUT retry).
6. Re-read. The read decides `saved`.

The sign-in background needs a URL path ending in an image extension (`docs/tenant-branding.md:36`). Check this in the sandbox.

**Never delete the old file.** Partial failure leaves an unused file and the old value still live.

## Rollback and disable

- Rollback: PUT the previous URL from `CustomValueChange`. The old file is still there.
- Disable: clear `SETTINGS_MEDIA_REPLACE_ENABLED` and redeploy, or remove one tenant id.

## Observability

Audit rows hold tenant, actor, key, hash, file id, step, outcome and time. No image bytes, original file names or customer content. Logs hold step and status only.

## Sandbox plan

Use `<test-sub-account>`, a throwaway sub-account, **not JCR**. Settle every Unverified item and record it here before any other client.

## Security baseline

```yaml
security_baseline:
  applies: true
  surfaces:
    - id: POST /api/settings/media
      tier: STATE-MUTATING
      controls:
        C1_auth:        { status: covered, mechanism: "session owner, exact origin, admin and client view refused, tenant from the session only" }
        C2_rate_limit:  { status: covered, mechanism: "hitRateLimit, proposal 20 per hour per user and 40 per tenant, before the body is read, fails closed" }
        C3_input:       { status: covered, mechanism: "strict three-field form, capped body, image keys only, WebP container and size re-read from bytes, SVG allowlist on a real XML parser" }
        C4_timeout:     { status: covered, mechanism: "10s calls, 20s upload, 15s and 35s step cutoffs, no blind upload retry; flag is the breaker" }
        C5_output_rate: { status: opted_out, justification: "one short JSON status" }
        C6_redaction:   { status: opted_out, justification: "no LLM; logs hold no content" }
        C7_idempotency: { status: covered, mechanism: "hash name, lookup with byte-hash check before upload" }
        C8_concurrency: { status: covered, mechanism: "existing per-tenant lease held across upload and PUT, kept after no answer" }
        C9_audit:       { status: covered, mechanism: "CustomValueChange row before the upload and before the PUT" }
        C10_abuse:      { status: covered, mechanism: "size caps, rate limits, exact tenant allowlist and kill switch" }
```

## Approval gates (each separate)

1. App version and `medias.*` scopes.
2. Client reauthorization.
3. The XML parser dependency.
4. First live upload, and which sub-account.
5. Any JCR media change (`loop-constraints.md` rule 12 forbids it today).
6. Deployment, including env vars and any migration on staging and production.

## Open questions

1. **Which SVG approach?** Decided: strict rejecting parser on `@xmldom/xmldom` 0.9.12.
2. **Which test sub-account?** Recommended: a new, empty one you create, never JCR.
3. **Existing non-SVG logos?** Decided: they keep working; SVG only applies to new uploads.
4. **How to roll out reauthorization?** Recommended: one client at a time; clients not yet reauthorized keep today's link field.
