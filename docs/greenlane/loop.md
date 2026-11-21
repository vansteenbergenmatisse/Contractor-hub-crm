# The verification loop (how every ticket runs)

The loop does not wait for the user between tickets. It stops only at the stops in `loop-constraints.md` (rule 15) and at context handover. Plan: `docs/greenlane/plan.md`. State: `PROGRESS.md`.

## One iteration = one ticket

1. **Constraints.** Read `loop-constraints.md` (skill `loop-engineering:loop-constraints`). Read `PROGRESS.md` "In progress" and "Next up".
2. **Plan.** Write the ticket plan and its seams under "In progress" in `PROGRESS.md`. Seams that follow `plan.md` count as confirmed; list them anyway.
3. **Make (red, green).** Tests first at the seams (skill `mattpocock-skills:tdd`), then the code. One test, one implementation per cycle.
4. **Gate 1, mechanical.** `pnpm check` exits 0. Playwright at the 14 widths and the 390x844 thumb check on UI tickets.
5. **Gate 2, three independent verifiers.** Separate agents, each given the diff and the stated intent, none given the maker's conclusion. Each defaults to REJECT.
   - **Checker:** `loop-engineering:loop-verifier` checklist: scope, intent, tests run, no cheating.
   - **Test audit:** `project-os:test-engineer`: are the tests meaningful, any tautologies, missing risk cases.
   - **Risk reviewer:** `project-os:security-reviewer` on any ticket touching auth, tenancy, tokens, webhooks, secrets or sends; `fe:design-reviewer` and `fe:review-final` on any UI ticket.
6. **Decide.** All APPROVE: continue. Any REJECT: fix the code, re-run gates 1 and 2 (round 2 of max 3). Two rounds with no progress, or round 3 still rejected: stop, write the reason under "Blockers", and tell the user.
7. **Record.** Move the "In progress" entry to the top of "Log" as what happened (files, commands, check result, verifier verdicts, what was not verified). Update "Current state", "Next up", "Blockers".
8. **Commit.** Local, on `develop`, stage by name, conventional message, `Co-Authored-By` line. After every major step, not only at the end of the ticket.
9. **Tell the user what to test on staging** for that ticket (after the user pushes). Then go to the next ticket without waiting.

## Context handover (about every 180,000 tokens, or earlier)

Claude cannot read an exact token count and cannot run `/clear` or `/compact` itself. So:
- Estimate the load. Trigger a handover at a ticket boundary when the session has had many tickets, long tool output, or about 150,000 tokens by estimate.
- Handover steps, in order: (1) make sure `PROGRESS.md` and the last commit are current; (2) write a full recap in chat: done, in progress, next, blockers, what the user must do; (3) take a screenshot of the running app if a UI exists, and save it under `docs/greenlane/screenshots/` only if the user wants it kept; (4) run skill `compact-ultra`, which saves a handover under `.compact-ultra/` (gitignored); (5) tell the user to run `/clear` and say "resume". This stop is unavoidable.
- A fresh session reads `CLAUDE.md`, `PROGRESS.md`, `loop-constraints.md`, this file, and the newest `.compact-ultra/handover-*.md`, then continues with "Next up".

## Screenshots

On UI tickets, take screenshots at the tested widths (Playwright or the Chrome tools), look at them, and fix what is wrong before the verifiers run. Attach the finding list to the verifier prompt.
