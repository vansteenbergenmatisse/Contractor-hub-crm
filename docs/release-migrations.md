# Release migrations

How committed Prisma migrations reach the staging and production databases. Decided by the owner on 2026-11-24.

## Decision

- **The Vercel build applies migrations** for `staging` and `main`: `vercel.json` sets `"buildCommand": "pnpm build && pnpm exec tsx scripts/vercel-migrate.ts"`. The app is built first, so a failing build never migrates. The migration step runs after it; if `prisma migrate deploy` fails or the step refuses, the build command exits non-zero, the Vercel build fails and Vercel keeps serving the previous deployment. Code that needs a new table is never live without it. (A non-zero build command failing the deployment is Vercel's documented behaviour; it has not yet been observed on this project.)
- **CI no longer migrates.** The old `migrate` job in `.github/workflows/ci.yml` ran in parallel with Vercel's deploy, and Vercel did not wait for it. Migration `20261124120000_custom_value_lock` showed the gap: it was applied on Neon `develop` only, and on any database without it every owner Settings save and Change image answered "retry" and the admin values page failed. One writer per database removes the race.
- `pnpm build` and `pnpm check` stay database-free. Only the Vercel build command touches a database.

## What runs per branch

The decision is `decide()` in `scripts/vercel-migrate-decide.ts`; `runMigrate()` in `scripts/vercel-migrate-run.ts` turns it into the exit code (both tested in `tests/scripts/vercel-migrate.test.ts`). It reads `VERCEL`, `VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.

| Build | Action |
|---|---|
| `VERCEL_ENV=production`, ref exactly `main` | `prisma migrate deploy`. |
| `VERCEL_ENV=production`, any other ref (also ` main`, `Main`) | Refuses. |
| `VERCEL_ENV=preview`, ref `staging` | `prisma migrate deploy`. |
| `VERCEL_ENV=preview`, ref `develop` | `prisma migrate status` if `DATABASE_URL_UNPOOLED` is set (build fails when a migration is pending); a warning and continue if it is not set. Never applies. |
| A Vercel build (`VERCEL` set) without `VERCEL_ENV` or `VERCEL_GIT_COMMIT_REF` while `DATABASE_URL_UNPOOLED` is set | Refuses: the system environment variables are not exposed, so it cannot tell which database it would touch. |
| Any other preview, local, unknown | Skip. No database is touched. |

Before `deploy` or `status` it refuses (build fails, nothing applied) when: `DATABASE_URL_UNPOOLED` or `DATABASE_URL` is missing or does not parse, the direct URL is a `-pooler` host, the two URLs are on different Neon endpoints, or **the direct URL is not on the Neon endpoint pinned for that environment**. Both URLs naming the same direct host is accepted (still one endpoint).

### Pinned Neon endpoints

`scripts/neon-endpoints.ts` holds, per environment (`production`, `staging`, `develop`), the expected Neon endpoint id: the first label of the host name without `-pooler` (for example `ep-xxx-123`). It is not secret: no user, password or database name. It exists because the only other boundary is Vercel's variable scoping: a staging build whose URLs both point at production would otherwise migrate production. The refusal message names the expected and the actual endpoint id, nothing else. Change an id only in a reviewed change that moves that environment to a new endpoint.

It never runs `migrate dev`, `db push`, `migrate reset` or `migrate resolve`. The script's own lines never contain a URL or password: one line `Release migrations: <action> env=<env> ref=<ref> migrations_in_repo=<n>` before Prisma runs and one line ending `result=...` after. Prisma's own output can print the database host and database name and the applied migration names (never the password).

## Setup (Matt, once)

Vercel project settings:

- `DATABASE_URL_UNPOOLED` and `DATABASE_URL` scoped to **Production** only (Neon `production` branch, direct and pooled URL) and to **Preview, Git branch `staging`** only (Neon `staging` branch). Never to Preview "all branches": a feature branch or fork build must not see a staging or production URL.
- Optional: the same pair for Preview branch `develop` (Neon `develop`), so its builds check for pending migrations.
- `DATABASE_URL` in each scope must be the pooled URL of the **same** Neon branch as `DATABASE_URL_UNPOOLED`, on the endpoint pinned in `scripts/neon-endpoints.ts`, or the build refuses.
- **"Automatically expose System Environment Variables" ON.** Without it `VERCEL_ENV` and `VERCEL_GIT_COMMIT_REF` are missing and every staging or production build refuses.
- **Production Branch = `main`.**
- A branch domain for `staging`, so the staging preview has a stable URL for the proofs below.
- `NODE_ENV` not set at install time: the step uses `tsx`, a devDependency, and Vercel skips devDependencies when `NODE_ENV=production` at install. Not verified from here that it is unset.
- Check whether the Neon Vercel integration is installed and injects its own per-branch preview database URLs. If it does, those values can override the scoped ones; turn that off or make sure it never covers `staging`. Not checked from here.
- Vercel fork protection (Git fork protection) on, so a pull request from a fork does not build with these variables without approval.
- Production deploys from the Vercel CLI only by Matt.
- After the first good staging and production release: delete the now-unused GitHub Environment secrets `DATABASE_URL_UNPOOLED` (environments `staging` and `production`). CI no longer reads them.
- For the staging owner-save proof (proof 3): `SETTINGS_WRITE_BACK_ENABLED` and `SETTINGS_WRITE_BACK_TENANTS` on Preview `staging`, with one test tenant only.

## Release order

### Staging

1. **Claude:** open a pull request `develop` → `staging`. CI `check` must pass. Name every new folder in `prisma/migrations` in the PR body.
2. **Matt:** confirm the setup above (once). Merge the PR.
3. **Proof 1, Vercel build log (Matt or Claude):** the line `Release migrations: deploy env=preview ref=staging ...` and then `... result=applied or already applied`. If the build failed, see Rollback.
4. **Proof 2, browser agent, signed in as an admin on the staging URL:** open `/admin/migrations`. It must show environment `preview (staging)`, "All N migrations are applied. None pending." and no failed or rolled-back entries.
5. **Proof 3, browser agent as the test client's owner:** in Settings change one open value (for example the business name), Save, and see "Saved". Reload; the value is the same. Then the browser agent or Matt opens that sub-account in HighLevel, Settings > Custom Values, finds the exact key that was saved, and compares its value character for character with what was typed.
6. **Proof 4, Claude with approval:** the newest `CustomValueChange` row for that tenant and key has outcome `saved`.
7. Run the per-migration steps the migration's own doc requires (for example the login-lock backfill in `docs/login-lock-rollout.md`).

### Production

0. **Test on a Neon branch of production first (CLAUDE.md rule).** Matt approves. A Neon branch is created from `production`. From a shell, `prisma migrate deploy` and then `prisma migrate status` run against that branch's direct URL (passed as a real environment variable, never written to a file in the repo). The result (migrations applied, status clean or not) is recorded in `PROGRESS.md` without any URL. The branch is deleted afterwards.
1. Same steps as staging with: PR `staging` → `main`, the Production scope variables, build log line `Release migrations: deploy env=production ref=main ...`, `/admin/migrations` showing `production (main)`, and the owner check on a real client only with that client's and Matt's agreement (otherwise only proofs 1, 2 and 4 on a read).

**Release production only by merging into `main`.** Other Vercel actions:

- **Promote to Production** of a preview deployment rebuilds it in the production environment (Vercel docs). That build has `VERCEL_ENV=production` and the preview's ref (not `main`), so the step refuses and the promotion fails. This is by design.
- **Redeploy** of a production deployment rebuilds it and runs `prisma migrate deploy` again. Harmless: already applied migrations are skipped.
- **Instant Rollback** does not rebuild, so it runs no migration.

## Rollback

- **Migration failed in the build:** the build fails, the previous deployment stays live, and Prisma records the failed migration in `_prisma_migrations` (`/admin/migrations` lists it as failed). Later deploys stop at it until it is resolved. Fix the cause, then, with Matt's approval, mark it with `prisma migrate resolve --rolled-back <name>` (or `--applied` if the change is in fact complete) against that database from a shell, and redeploy. Never edit an applied migration.
- **Migration succeeded, something after it failed** (or the deployment was not promoted): the schema is now ahead of the live code. This is safe only because migrations are additive (rule below): the old code ignores the new tables. Fix and redeploy; the next build finds nothing to apply.
- **Code is bad, migration is fine:** use Vercel Instant Rollback to the previous deployment. It does not rebuild, so nothing migrates; the old code runs against the new schema, which is safe because migrations are additive.
- **Schema must change back:** write a new, forward migration. Never `migrate reset` or `db push` on staging or production.

## Rule: migrations stay additive (expand, then contract)

Old code keeps running while the new deployment builds, and after an Instant Rollback. So a release may only add: new tables, new nullable or defaulted columns, new indexes, new foreign keys. Renames, drops and type changes go in two releases: first add the new shape and ship code that uses it (expand), then remove the old shape in a later release once no live code reads it (contract).

`tests/prisma/migrations.test.ts` allows only additive statements: it fails on `DROP`, on any `ALTER TABLE` other than `ADD CONSTRAINT`, and on data changes. So even adding a column to an existing table (`ALTER TABLE ... ADD COLUMN`) fails it today: such a migration needs a hand review and a deliberate update of that test in the same change.

`20261124120000_custom_value_lock` is additive and safe while the old code is live: it creates table `CustomValueLock`, a unique index on (`tenantId`, `key`), and a foreign key to `Tenant` (on delete cascade). Adding the foreign key takes a brief `SHARE ROW EXCLUSIVE` lock on `Tenant`, which blocks writes to `Tenant` for that moment but not reads. Until a database has it, the app answers "Database update pending" instead of "try again", and writes nothing: owner Settings save and Change image get status `pending_update` (log line `Settings save failed: step=locks reason=migration_pending migration=20261124120000_custom_value_lock`), the admin values page names the migration, and admin Lock or Unlock answers 409 `pending_update` (log line `Admin value lock failed: reason=migration_pending migration=...`).

## Known risks

- **Cold Neon compute:** a free-plan compute that slept must wake during the build. A connection timeout fails the build; redeploying retries it. A timeout before Prisma connects applies nothing; a failure mid-migration is the "Migration failed" case under Rollback (whether a partly run migration is rolled back by Postgres has not been checked for this setup).
- **Concurrent builds:** two builds for the same branch can start together. Prisma Migrate takes a Postgres advisory lock, so the second waits for the first; after the first finishes it finds nothing to apply. If the wait exceeds Prisma's lock timeout (its length is not checked here), that build fails; redeploy it.
