# Loop constraints (read at the start of every loop run; binding)

Source: the user's rules in `CLAUDE.md` and the decisions recorded in `PROGRESS.md`. Enforced by the `loop-engineering:loop-constraints` skill.

## Push and merge
1. Never push, force-push, merge or delete a branch without asking the user each time.
2. Commits are local, on `develop`, after every major step. Never commit to `staging` or `main`.
3. Never run `neon deploy`, apply a migration, or change a Neon branch without the user's approval. Creating a migration file is allowed.

## Paths
4. Never read out, print, edit or commit `.env`, `.env.*` (except `.env.example`), or any secret, token or full connection string.
5. Never put a real client value (email, user ID, location ID, phone) in a committed file.
6. Never edit `tests/**` to make a failing test pass. Fix the code.

## Code
7. Change the smallest area that solves the ticket. No unrelated refactors.
8. Do not install a dependency or edit the lockfile without the user's approval. Stop the loop and ask when a ticket needs one.
9. One package manager: pnpm.
10. Frontend design stays as in `docs/greenlane/greenlane-dashboard.html`. Only wire it up.
11. The browser never holds a HighLevel token. Tenant and `locationId` come from the server session only.

## JCR Landscaping (real client, the only test sub-account)
12. Code that touches JCR only reads. No texts, no emails to the JCR owner, no contact changes, no custom-value writes, no workflow publish. Settings write-back stays off.
13. Test invites go to the user's own email, never to the JCR owner.

## Stops
14. Revision cap: 3 rounds per ticket. Stop after 2 rounds in a row with no progress and write why under "Blockers" in `PROGRESS.md`.
15. Stop and ask the user when a ticket needs: a dependency, a migration applied, a secret value, a push, or a decision not in `PROGRESS.md`.
16. `loop-pause-all`: if the user writes "pause" in chat, finish the current commit and stop.
