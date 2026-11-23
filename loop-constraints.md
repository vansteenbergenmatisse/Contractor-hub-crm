# Loop constraints (read at the start of every loop run; binding)

Source: the user's rules in `CLAUDE.md` and the decisions recorded in `PROGRESS.md`. Enforced by the `loop-engineering:loop-constraints` skill.

## Push and merge
1. Pushing `develop` is allowed (user, 2026-11-21): push at each ticket boundary, after `pnpm check` is green and the verifiers approved, never mid-ticket and never force. Never push, merge or delete `staging` or `main`, and never merge a PR or delete a branch, without asking the user each time.
2. Commits are on `develop`, after every major step. Never commit to `staging` or `main`.
3. Applying migrations to the Neon `develop` branch is approved (user, 2026-11-21), one migration at a time, with `prisma migrate deploy` after a `migrate status` check. Never apply to staging or production by hand (CI does it on merge), never run `neon deploy`, never change a Neon branch, without the user's approval. Creating a migration file is allowed.

## Paths
4. Never read out, print, edit or commit `.env`, `.env.*` (except `.env.example`), or any secret, token or full connection string.
5. Never put a real client value (email, user ID, location ID, phone) in a committed file.
6. Never edit `tests/**` to make a failing test pass. Fix the code.

## Code
7. Change the smallest area that solves the ticket. No unrelated refactors.
8. Do not install a dependency or edit the lockfile without the user's approval. Approved so far: Better Auth (user, 2026-11-21; plus a Prisma adapter if Better Auth needs one, exact versions logged in `PROGRESS.md`). Any other dependency: stop and ask.
9. One package manager: pnpm.
10. Frontend design stays as in `docs/greenlane/greenlane-dashboard.html`. Only wire it up.
11. The browser never holds a HighLevel token. Tenant and `locationId` come from the server session only.

## JCR Landscaping (real client, the only test sub-account)
12. Code that touches JCR only reads. No texts, no emails to the JCR owner, no contact changes, no custom-value writes, no workflow publish. Settings write-back stays off. One exception (user, 2026-11-22): the first real write-back test may change ONE harmless custom value on JCR, through the Settings save as a signed-in JCR owner, after the user names the key and value.
13. Test invites go to the user's own email, never to the JCR owner.

## Stops
14. No revision cap (user, 2026-11-21). Keep fixing and re-verifying until the verifiers approve. Stop only after 2 rounds in a row with no progress, and write why under "Blockers" in `PROGRESS.md`.
15. Stop and ask the user when a ticket needs: an unapproved dependency, a migration applied outside `develop`, a missing or wrong secret or env var (tell the user which name, never a value), a push of `staging` or `main`, or a decision with no sensible default. A decision with a sensible default is taken, recorded in `PROGRESS.md` as a reversible proposal, and the loop continues. Do more than the minimum rather than less (user's preference).
16. `loop-pause-all`: if the user writes "pause" in chat, finish the current commit and stop.
