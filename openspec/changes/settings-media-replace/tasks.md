# Tasks: Settings media replace

Status: built-off. The same-URL gate is dropped by the user's "Upload and update" decision (2026-11-23). Nothing is live.

## Approval gates (user, each separate)

- [ ] Gate 1: new app version with `medias.readonly` and `medias.write`
- [ ] Gate 2: client reauthorization
- [x] Gate 3: XML parser dependency: `@xmldom/xmldom` 0.9.12
- [ ] Gate 4: first live upload, and which sub-account (`<test-sub-account>`, not JCR)
- [ ] Gate 5: any JCR media change, then update `loop-constraints.md` rule 12
- [ ] Gate 6: deployment (Vercel env vars, migration on staging and production)

## Build, mocked only

- [x] Contract tests for upload, list and every error case, mocked
- [x] `highlevel/api/media-write.ts`, with no delete call
- [x] SVG validator; malicious SVG test set (each rejected construct)
- [x] Server re-check of raster bytes, type and size
- [x] Orchestration in `settings-write-back`, flags off by default
- [x] Audit through the existing `CustomValueChange` table, no migration, no customer content
- [x] Route: owner only, origin, View as client refused, rate limit
- [x] Tests: tenant isolation, no-answer re-read, hash mismatch, bad URL host
- [x] Tests: partial failure at each step leaves the old value live
- [x] Settings UI: canvas WebP, SVG picker, per-image result
- [ ] Independent security review

## Live (after gates 2, 4, 5, 6 as each applies)

- [ ] Sandbox: settle every Unverified item and record it in the proposal
- [ ] Rehearse rollback (PUT previous URL) and disable path on the sandbox
- [ ] Turn on per tenant through the allowlist
