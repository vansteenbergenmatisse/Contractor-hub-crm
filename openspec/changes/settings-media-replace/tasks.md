# Tasks: Settings media replace

## 0. First gate (blocks everything below)

- [ ] User approves a UI-only same-URL replace test on a throwaway sub-account (not JCR), for PNG, SVG and WebP.
- [ ] Record URL, file id, `Content-Type`, `Cache-Control` and `Age` before and after.
- [ ] If it fails or has no API route, the user chooses another route. Do not fall back silently.

Status: Blocked. No task starts until its gate is approved.

## Approval gates (user, each separate)

- [ ] Gate 1: new app version with `medias.readonly` and `medias.write`
- [ ] Gate 2: client reauthorization
- [ ] Gate 3: XML parser dependency (exact package and version)
- [ ] Gate 4: first live upload, and which sub-account (`<test-sub-account>`, not JCR)
- [ ] Gate 5: any JCR media change, then update `loop-constraints.md` rule 12
- [ ] Gate 6: deployment (Vercel env vars, migration on staging and production)

## Build, mocked only (after gates 1 and 3)

- [ ] Contract tests for upload, list and every error case, mocked
- [ ] `highlevel/api/media-write.ts`, with no delete call
- [ ] SVG validator; malicious SVG test set (each rejected construct)
- [ ] Server re-check of raster bytes, type and size
- [ ] Orchestration in `settings-write-back`, flags off by default
- [ ] Audit table and migration file, no customer content
- [ ] Route: owner only, origin, View as client refused, rate limit
- [ ] Tests: tenant isolation, no-answer re-read, hash mismatch, bad URL host
- [ ] Tests: partial failure at each step leaves the old value live
- [ ] Settings UI: canvas WebP, SVG picker, per-image result
- [ ] Independent security review

## Live (after gates 2, 4, 5, 6 as each applies)

- [ ] Sandbox: settle every Unverified item and record it in the proposal
- [ ] Rehearse rollback (PUT previous URL) and disable path on the sandbox
- [ ] Turn on per tenant through the allowlist
