# Proposal: Replace a client's image from Settings

Status: **built-off**. Built and tested against a mocked HighLevel only, off by default. No live HighLevel call, upload, Marketplace, Vercel or database change has been made.

## User decision (2026-11-23): replace, same name, same folder

The user's words: "it can delete it and replace it if it gives the same name and puts it in the same place / folder, and puts the new url in the custom value". This replaces the earlier "Upload and update" decision, where the old file stayed. The public API documents no way to replace an image's content in place (`apps/medias.json`, `apps/v3/medias-v3.json`), and private HighLevel endpoints are not an accepted route, so the server runs the sequence below.

## As built

- `POST /api/settings/media`, owner only. Needs `SETTINGS_MEDIA_REPLACE_ENABLED` and `SETTINGS_MEDIA_REPLACE_TENANTS`, and also the write-back flags for the tenant, because the value change is a normal Settings save.
- SVG parser: `@xmldom/xmldom` 0.9.12, pinned, no dependencies and no install scripts.
- SVG allowlist now takes normal logo features: `defs`, gradients, `stop`, `clipPath`, `mask`, `pattern`, `use`, `href`/`xlink:href` and `url(#id)` to a local id that exists, and a `<style>` sheet that passes a strict CSS check. References may not loop, repeat an id, chain past 16 steps or expand past 100,000 nodes (proposals). `metadata`, comments and editor namespaces (Illustrator, Inkscape, Sketch, Figma) are removed from the upload. Script, `foreignObject`, `on*`, external references, DOCTYPE and entities are still refused, and the owner sees the specific reason.
- Raster: the file keeps its format. The browser starts with WebP; if the current file is a PNG or JPG, the server answers with that format before any write and the browser encodes once more. The server walks PNG and JPEG structure as it does WebP. GIF and other formats the canvas cannot write are refused.
- **Known limit:** the logo and favicon accept SVG only, so a logo whose current file is a PNG cannot be replaced from Settings: it is refused as a format mismatch.
- Audit: no new table and no migration. A `CustomValueChange` row comes first for each external write: `upload:<key>-<sha256-12>` for the upload, the previous and new URL for the PUT, and `trash:<file id>` with the file's URL as previous value for a removal. **The `upload:` and `trash:` rows record a file, not a value change, so they are not rollback targets.**
- **OAuth scopes:** `medias.readonly` and `medias.write` are NOT in the default list, so an install or reconnect never requests a scope the Marketplace app may not have enabled. After the app version with those scopes is approved (gate 1), add them through `GHL_OAUTH_SCOPES`, which replaces the default list, so it must hold the full list plus the two. Until a client has the grant, a refused media call shows the "needs re-approval" message. **Scope of the trash route:** `PUT /medias/delete-files` lists no scope in the docs (`Location-Access: []`); only `DELETE /medias/{id}` names `medias.write`. That `medias.write` covers the trash route is unverified. A refusal leaves the old file and tells the owner.
- SVG limit: at most 20,000 nodes in the file, counting elements, comments, text and whitespace. Comments are left out while serializing.
- WebP: every RIFF chunk is walked. Accepted: one `VP8 ` or `VP8L` frame, alone or as `VP8X`, optional `ICCP`, optional `ALPH`, frame, with the frame size equal to the canvas. `ANIM`, `ANMF`, `EXIF`, `XMP ` and unknown chunks are refused. Chrome's canvas output was checked and writes `VP8X` + `ICCP`; other browsers' encoders are not tested.
- Time limits (proposals, not measured): no upload starts after 15 seconds and no PUT after 25, measured from the start of the request through the save's own read, PUT and confirming read, inside the route's 60 seconds.
- Hosts: `files.leadconnectorhq.com` is added to the logo and preview defaults. Its files have no extension, so the background rule also accepts a last path segment with no dot on that host only. A named video or page is still refused.

**Known limits, not verified live:**

- The OpenAPI example upload URL is on `storage.googleapis.com`, which is not allowlisted. If real uploads answer with that host, every change stops at `bad_host` with the old value live, until the user approves that host through `LOGO_HOST_ALLOWLIST`.
- A browser with no canvas WebP encoder gets a clear message instead of an upload. Which phones this affects, Safari on iPhone especially, is not tested.
- The list call's `sortBy=createdAt` and `type=file`/`type=folder` values, how `parentId`, `offset` and `limit` behave, the `Version` value (`v3` is sent), and whether HighLevel keeps the bytes unchanged. If it alters them, a repeat of the same image stops at `hash_mismatch`.
- The documented list example shows no id field. The code reads `_id`, then `id`, and needs `altId` and `altType` on each row. If real rows lack them, every change stops at `library_limit` before any write.
- **If HighLevel re-encodes an uploaded file, or lists it late, the byte or listing proof fails:** the image still changes, but the old file is kept and reported, every time.
- Whether the upload accepts a name that already exists in the folder, keeps it exactly, and honors `parentId`. Whether `status: "trashed"` really is recoverable, and what its answer looks like (the documented example is `[{deleted, id}]`). Any other answer is reported as unconfirmed.
- **Only custom values are checked for other uses of the old URL.** A funnel, website, email or workflow that uses the same URL directly is not seen, and would show a broken image once the file is trashed. Whether a trashed file's URL keeps serving is unverified.

## Why

User request (2026-11-23): replace a client's image from Settings, compressed to WebP in the browser and changed in the HighLevel media library. Logos and favicons are SVG only.

## Contract

Source: `GoHighLevel/highlevel-api-docs@0af86a4`. No live call made.

| Call | Scope | Request | Response |
|---|---|---|---|
| `POST /medias/upload-file` | `medias.write` | multipart `file`, `name`, `parentId` | `{fileId,url}` |
| `GET /medias/files` | `medias.readonly` | requires `sortBy`, `sortOrder`, `type`, `altType`, `altId`; optional `offset`, `limit`, `parentId` | file list |
| `PUT /medias/delete-files` | none listed | `filesToBeDeleted: [{_id}]`, `altType`, `altId`, `status: "trashed"` | `[{deleted,id}]` |

- Limit: 25 MB in the API docs, 100 MB on the help page. Use the lower.
- `Version`: `v3` in `apps/v3/medias-v3.json`; the older file lists `2021-07-28`. The sandbox settles which works.
- The docs show no way to replace an image's content in place. "Change" means the sequence below (user decision above).
- `DELETE /medias/{id}` (permanent) and `POST /medias/{id}` (rename) are never called.
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

All under the per-tenant lease.

1. **Find the current file**, the one the custom value points at. Walk the tenant's library (`GET /medias/files`, every folder, at most 120 calls and 12 seconds). The offset moves by the rows returned and only an empty page ends a folder. Match the exact URL. No match, more than one match, a row that cannot be read, or a library that could not be read to the end stops here, before any write.
2. **Validate.** The new file keeps the current file's exact name. A format that differs from the name's extension is refused; a photo is encoded to the file's format first.
3. **Check for identical content.** Up to 8 same-name files in that folder are fetched through the limited fetcher and their hash compared (more than 8 stops). Same bytes: reuse that file, no upload. Other bytes: another file, left alone. If the current file already holds these bytes, nothing changes.
4. **Upload** under that name into that `parentId`, after an audit row. **No blind upload retry.** On no answer, re-read first. If still absent, report `unknown`, because the list may lag. Verify the URL host against the allowlist (`assets.cdn.filesafe.space` plus `LOGO_HOST_ALLOWLIST`) and never widen it automatically. An answer naming the old file's id or URL stops the run.
5. **Save** the new URL through the existing save rules (stale check, audit, no PUT retry) and read it back. If that fails, the old value and file stay live. The file this request uploaded is trashed only when the save certainly did not apply, no custom value holds its URL and its id verifies; otherwise it is reported.
6. **Remove the old file**, only after the read-back. Read the raw value of every custom value row, also rows without a name or readable key and keys listed twice. An unreadable row keeps the file; any other value containing the old URL keeps it. **Prove the new file:** the real listing must show its id, URL, exact name and folder, and its fetched bytes must hash to what was sent; otherwise keep the old file. Then verify the old file's id, URL, name and folder (at most 20 pages and 5 seconds), recheck the 40-second cutoff immediately before the trash call, write an audit row, and send one `PUT /medias/delete-files` with `status: "trashed"`.
7. **Tell the owner** what happened: replaced, already current, kept because in use, kept because the new file could not be proven, could not be removed, or removal unconfirmed.

The sign-in background needs a URL path ending in an image extension (`docs/tenant-branding.md:36`). Check this in the sandbox.

## Rollback and disable

- Rollback: restore the old file from the media library trash, then PUT the previous URL from `CustomValueChange`. Whether a trashed file can be restored, and for how long, is unverified.
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
        C4_timeout:     { status: covered, mechanism: "10s calls, 20s upload, 15s and 25s step cutoffs, no blind upload retry; flag is the breaker" }
        C5_output_rate: { status: opted_out, justification: "one short JSON status" }
        C6_redaction:   { status: opted_out, justification: "no LLM; logs hold no content" }
        C7_idempotency: { status: covered, mechanism: "same-name file in the same folder compared by byte hash before upload; no retry of upload, PUT or trash" }
        C8_concurrency: { status: covered, mechanism: "existing per-tenant lease held across upload and PUT, kept after no answer" }
        C9_audit:       { status: covered, mechanism: "CustomValueChange row before the upload, the PUT and each trash call; no file bytes" }
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
