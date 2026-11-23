# Proposal: Replace a client's image from Settings

## Hard requirement from the user (2026-11-23), overrides the sequence below

Replacing an image MUST overwrite the existing media library file so its URL stays exactly the same. Uploading a new file and repointing the custom value is NOT accepted as the default. Any "upload new, repoint" sequence in this document is only a fallback, and needs the user's explicit choice.

What is known (public sources, no live call, 2026-11-23):

- API: NO documented same-URL image replace. `UpdateObject` takes `name, altType, altId`, `UpdateMediaObject` takes `id, name`, and upload has no target file id (`apps/medias.json:721,798`, `apps/v3/medias-v3.json:731,808`).
- UI: possibly shipped, not documented. HighLevel's ideas board marks "Ability to replace existing media", with a merged request for replacing without updating the URL, as live on 2026-06-08. It gives no steps, file types or URL guarantee. Its Media Storage guide promises same-URL edits only for `.txt`, `.css`, `.json`, `.sql` and `.rtf`.
- Not documented: whether the URL path derives from the file id, the content type after a replace, and CDN caching.
- Private HighLevel endpoints are not an accepted route: they are unsupported and can break without notice.
- Format conflict: a same-URL replace keeps the path, so a `.png` URL cannot honestly become WebP. Until tested, a replacement keeps the original format. WebP compression applies only where the URL already ends in `.webp`, or to a fallback upload.

First gate: a UI-only test on a throwaway sub-account, approved by the user: upload `A.png`, copy its URL, use Replace with a visibly different `B.png`, compare URL and file id, open the original URL in a private window and record `Content-Type`, `Cache-Control` and `Age`. Repeat for SVG and WebP. If no supported same-URL replace exists for images, this change stays Blocked until the user chooses another route.

Status: **Blocked** until the approval gates below are approved. Plan only. Nothing here is built. Every design item is a proposal, not existing.

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
- The docs show no way to replace an image's content in place. "Change" means: upload new, repoint the custom value, keep the old file.
- `DELETE /medias/{id}` and `POST /medias/{id}` (rename) are never called.
- Error cases: 400, 401, 403, 413, 422, 429, 5xx, timeout, malformed body, unapproved URL host.

**Unverified:** upload URL host and shape, CDN content type for SVG, whether HighLevel sanitizes or alters bytes, deleted-URL behavior, cache, media rate limits, idempotency, list filtering by name, and list freshness after upload.

## Design (proposal, not existing)

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
    - id: POST <settings media route, proposal>
      tier: STATE-MUTATING
      controls:
        C1_auth:        { status: planned, mechanism: "session owner, exact origin, admin and client view refused" }
        C2_rate_limit:  { status: planned, mechanism: "hitRateLimit per user and tenant, fails closed" }
        C3_input:       { status: planned, mechanism: "server re-check of bytes, type, size; SVG allowlist" }
        C4_timeout:     { status: planned, mechanism: "bounded calls, no blind upload retry; flag is the breaker" }
        C5_output_rate: { status: opted_out, justification: "one short JSON status" }
        C6_redaction:   { status: opted_out, justification: "no LLM; logs hold no content" }
        C7_idempotency: { status: planned, mechanism: "hash name, verified lookup before upload" }
        C8_concurrency: { status: planned, mechanism: "existing per-tenant lease" }
        C9_audit:       { status: planned, mechanism: "row before each external write" }
        C10_abuse:      { status: planned, mechanism: "size caps, rate limits, tenant allowlist" }
```

## Approval gates (each separate)

1. App version and `medias.*` scopes.
2. Client reauthorization.
3. The XML parser dependency.
4. First live upload, and which sub-account.
5. Any JCR media change (`loop-constraints.md` rule 12 forbids it today).
6. Deployment, including env vars and any migration on staging and production.

## Open questions

1. **Which SVG approach?** Recommended: strict rejecting parser on a vetted XML library.
2. **Which test sub-account?** Recommended: a new, empty one you create, never JCR.
3. **Existing non-SVG logos?** Recommended: keep them working; enforce SVG only on new uploads.
4. **How to roll out reauthorization?** Recommended: one client at a time; clients not yet reauthorized keep today's link field.
