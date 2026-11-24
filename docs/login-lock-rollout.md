# Login lock rollout

How to bring `TenantLoginLock` to an environment. The admin Login column reads this table only, so a client that was turned off before the table existed reads **on** until it has a lock row. Its existing users stay blocked, but a new HighLevel user could get in.

## Required order, per environment

1. **Migration first.** `20261123120000_tenant_login_lock` must be in the database before the code that reads the table runs. Sign-in, embed, provisioning and invites all query it, so without the table they fail.
2. **Dry run.** `pnpm exec tsx scripts/backfill-login-locks.ts` with that environment's database. Writes nothing.
3. **Review the output.**
   - "Clients already off": all users blocked, at least one not removed from HighLevel. One person blocked by hand on a one-user client also lands here, so check each line.
   - "Needs a decision": every user was removed from HighLevel. Nothing shows whether an admin turned the client off, so the script never locks these. To keep one off, use Turn off login after the deploy.
4. **Apply, with approval.** `CONFIRM_HOST=<host> pnpm exec tsx scripts/backfill-login-locks.ts --apply`. Safe to run again: existing locks are kept.
5. **Deploy the code.**
6. **Run the dry run again.** A client turned off by the old code between steps 4 and 5 has no lock. Apply again if it lists one.

## Why the order is not automatic today

- `.github/workflows/ci.yml` runs `prisma migrate deploy` on a push to `staging` or `main`, after `pnpm check`.
- `vercel.json` has no build command, and nothing in the repo makes Vercel wait for that job. A merge that carries both the migration and the code can therefore serve the code before the table exists. How Vercel orders this for this project has not been checked.
- CI does not migrate `develop`. There the migration is applied by hand under the rule in `loop-constraints.md`.

## Way to keep the order without a CI change (proposal, not done)

Promote in two pull requests: first one that carries only the migration, wait for the `migrate` job to pass, run steps 2 to 4, then the one that carries the code. Changing CI or Vercel so the deploy waits for the migration is a separate decision for the user.
