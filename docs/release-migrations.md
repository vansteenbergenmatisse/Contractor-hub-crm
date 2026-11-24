# Release migrations

How committed Prisma migrations reach the staging and production databases. Decided by the owner on 2026-11-24.

## Decision

- **The Vercel build applies migrations** for `staging` and `main`: `vercel.json` sets `"buildCommand": "pnpm exec tsx scripts/vercel-migrate.ts && pnpm build"`. If `prisma migrate deploy` fails, the build fails and Vercel keeps serving the previous deployment. Code that needs a new table is never live without it.
- **CI no longer migrates.** The old `migrate` job in `.github/workflows/ci.yml` ran in parallel with Vercel's deploy, and Vercel did not wait for it. Migration `20261124120000_custom_value_lock` showed the gap: it was applied on Neon `develop` only, and on any database without it every owner Settings save and Change image answered "retry" and the admin values page failed. One writer per database removes the race.
- `pnpm build` and `pnpm check` stay database-free. Only the Vercel build command touches a database.

## What runs per branch

The decision is `decide()` in `scripts/vercel-migrate-decide.ts` (tested in `tests/scripts/vercel-migrate.test.ts`). It reads `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.

| Build | Action |
|---|---|
| `VERCEL_ENV=production`, ref `main` | `prisma migrate deploy`. Refuses (build fails) when `DATABASE_URL_UNPOOLED` or `DATABASE_URL` is missing, when the direct URL is a `-pooler` host, or when the two URLs point to different Neon endpoints. |
| `VERCEL_ENV=production`, any other ref | Refuses. |
| `VERCEL_ENV=preview`, ref `staging` | `prisma migrate deploy`, same checks. |
| `VERCEL_ENV=preview`, ref `develop` | `prisma migrate status` if `DATABASE_URL_UNPOOLED` is set (build fails when a migration is pending); a warning and continue if it is not set. Never applies. |
| Any other preview, local, unknown | Skip. No database is touched. |

It never runs `migrate dev`, `db push`, `migrate reset` or `migrate resolve`. Output never contains a URL or password: one line `Release migrations: <action> env=<env> ref=<ref> migrations_in_repo=<n>` before Prisma runs and one line ending `result=...` after. Prisma's own output names the database host and the applied migrations.

## Setup (Matt, once, in the Vercel dashboard)

- `DATABASE_URL_UNPOOLED` for **Production**: the Neon `production` branch's direct URL.
- `DATABASE_URL_UNPOOLED` for **Preview**, limited to the Git branch `staging`: the Neon `staging` branch's direct URL.
- Optional: the same for Preview branch `develop` (Neon `develop`), so its builds check for pending migrations.
- `DATABASE_URL` in each scope must be the pooled URL of the **same** Neon branch, or the build refuses.
- Not verified from here: that Vercel installs devDependencies for this project (the build command uses `tsx`, a devDependency). Vercel does so by default unless `NODE_ENV=production` is set at install time.

## Release order

### Staging

1. **Claude:** open a pull request `develop` → `staging`. CI `check` must pass. Name every new folder in `prisma/migrations` in the PR body.
2. **Matt:** confirm `DATABASE_URL_UNPOOLED` is set for Preview `staging` (once). Merge the PR.
3. **Proof 1, Vercel build log (Matt or Claude):** the line `Release migrations: deploy env=preview ref=staging ...` and then `... result=applied or already applied`. If the build failed, see Rollback.
4. **Proof 2, browser agent, signed in as an admin on the staging URL:** open `/admin/migrations`. It must show environment `preview (staging)`, "All N migrations are applied. None pending." and no failed or rolled-back entries.
5. **Proof 3, browser agent as a test client's owner:** in Settings change one open value (for example the business name), Save, and see "Saved". Reload; the value is the same. Read it back from HighLevel (the sub-account's custom values) and it must be identical.
6. **Proof 4, Claude with approval:** the newest `CustomValueChange` row for that tenant and key has outcome `saved`.
7. Run the per-migration steps the migration's own doc requires (for example the login-lock backfill in `docs/login-lock-rollout.md`).

### Production

Same steps with: PR `staging` → `main`, the Production scope variable, build log line `Release migrations: deploy env=production ref=main ...`, `/admin/migrations` showing `production (main)`, and the owner check on a real client only with that client's and Matt's agreement (otherwise only proofs 1, 2 and 4 on a read).

## Rollback

- **Migration failed in the build:** the build fails, the previous deployment stays live, and Prisma records the failed migration in `_prisma_migrations` (`/admin/migrations` lists it as failed). Later deploys stop at it until it is resolved. Fix the cause, then, with Matt's approval, mark it with `prisma migrate resolve --rolled-back <name>` (or `--applied` if the change is in fact complete) against that database from a shell, and redeploy. Never edit an applied migration.
- **Code is bad, migration is fine:** use Vercel Instant Rollback to the previous deployment. It does not rebuild, so nothing migrates; the old code runs against the new schema, which is safe because migrations are additive.
- **Schema must change back:** write a new, forward migration. Never `migrate reset` or `db push` on staging or production.

## Rule: migrations stay additive (expand, then contract)

Old code keeps running while the new deployment builds, and after an Instant Rollback. So a release may only add: new tables, new nullable or defaulted columns, new indexes, new foreign keys. Renames, drops and type changes go in two releases: first add the new shape and ship code that uses it (expand), then remove the old shape in a later release once no live code reads it (contract). `tests/prisma/migrations.test.ts` already fails on `DROP` and on an `ALTER TABLE` other than `ADD CONSTRAINT`.

`20261124120000_custom_value_lock` is additive and safe while the old code is live: it creates table `CustomValueLock`, a unique index on (`tenantId`, `key`), and a foreign key to `Tenant` (on delete cascade). Adding the foreign key takes a brief `SHARE ROW EXCLUSIVE` lock on `Tenant`, which blocks writes to `Tenant` for that moment but not reads. Until a database has it, the app now answers "Database update pending" (status `pending_update`, log line `Settings save failed: step=locks reason=migration_pending migration=20261124120000_custom_value_lock`) instead of "try again", and writes nothing.

## Known risks

- **Cold Neon compute:** a free-plan compute that slept must wake during the build. A connection timeout fails the build; redeploying retries it. A timeout before Prisma connects applies nothing; a failure mid-migration is the "Migration failed" case under Rollback (whether a partly run migration is rolled back by Postgres has not been checked for this setup).
- **Concurrent builds:** two builds for the same branch can start together. Prisma Migrate takes a Postgres advisory lock, so the second waits for the first; after the first finishes it finds nothing to apply. A wait longer than Prisma's lock timeout fails that build; redeploy it.
- **Promoting a preview to production in Vercel** does not rebuild, so it runs no migration. Release to production by merging into `main` only.
