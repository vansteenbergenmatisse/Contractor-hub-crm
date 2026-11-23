# Tasks: Settings write-back

- [x] HighLevel adapter and contract tests, mocked only
- [x] Save rules, audit table and migration file
- [x] Save route: auth, origin, flags, rate limit, strict input
- [x] Settings page: save, per-field result, unchanged with the flag off
- [ ] Independent security review
- [ ] Apply the migration to Neon `develop`
- [ ] User gate: first live write (which sub-account, which harmless key)
- [ ] User gate: turn on for JCR, then update `loop-constraints.md` rule 12
- [ ] User gate: Vercel env vars, and OAuth scope or app version if the write scope is missing
- [ ] User gate: promote to staging and production, which runs the migration there
