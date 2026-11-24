# Login lock rollout

How to bring `TenantLoginLock` to an environment. The admin Login column reads this table only, so a client that was turned off before the table existed reads **on** until it has a lock row. Its existing users stay blocked, but a new HighLevel user could get in.

## Required order, per environment

1. **Migration first.** `20261123120000_tenant_login_lock` must be in the database before the code that reads the table runs. Sign-in, embed, provisioning and invites all query it, so without the table they fail.
2. **Dry run.** `pnpm exec tsx scripts/backfill-login-locks.ts` with that environment's database. Writes nothing.
3. **Review the output.**
   - "Clients already off": all users blocked, at least one not removed from HighLevel. Each line shows "blocked without a removal mark: X of Y". Those blocks are either an admin's block or a HighLevel removal that stopped halfway, and the data cannot tell them apart. One person blocked by hand on a one-user client also lands here, so check each line and decide: lock or exclude.
   - Exclude a client when it was not really turned off. A lock denies sign-in, embed, provisioning and invites for the whole client, and Turn on login afterwards re-enables every non-removed user, including someone blocked on purpose.
   - "Needs a decision": every user was removed from HighLevel. Nothing shows whether an admin turned the client off, so the script never locks these. To keep one off, use Turn off login after the deploy.
4. **Apply, with the user's approval for this environment.** Put every line of "Clients already off" in exactly one list:

   `CONFIRM_HOST=<host> pnpm exec tsx scripts/backfill-login-locks.ts --apply --tenants=<ids to lock> --exclude=<ids to leave alone>`

   Ids are comma-separated with no spaces. `--exclude` can be left out when nothing is excluded. If nothing should be locked, skip this step. The script reads the database again and writes nothing, exiting with an error, if an id is unknown, repeated, already locked or no longer qualifies, or if a client qualifies that is in neither list. Then run the dry run, review the change and build the lists again. Excluded clients stay in the dry run's list on later runs, so exclude them again.
5. **Deploy the code.**
6. **Run the dry run again.** A client turned off by the old code between steps 4 and 5 has no lock. If it lists a new client, review it and repeat step 4 with the approval for this environment.

## Why the order is not automatic (updated 2026-11-24)

- Step 1 is now part of the deploy: for `staging` and `main` the Vercel build runs `prisma migrate deploy` before `next build` (`vercel.json` `buildCommand`, `scripts/vercel-migrate.ts`). A failed migration fails the build, so the code never serves without its table. CI no longer migrates. See `docs/release-migrations.md`.
- The backfill (steps 2 to 4) is not automatic and must not be: it needs a human review of each client. With the migration and the code in one deploy, steps 2 to 4 run right after that deploy, and step 6 covers clients turned off in between. Until the backfill has run, a client turned off before the table existed reads **on** (see the top of this file).
- `develop` is still migrated by hand under the rule in `loop-constraints.md`; its Vercel build only checks (`prisma migrate status`).
- To keep the strict order (backfill before the code is live), promote in two pull requests: first one that carries only the migration (its build applies it), run steps 2 to 4, then the one that carries the code.
