# PROGRESS

Single source of truth for where the project stands. Read it at the start of every session and before every ticket. Update it after every ticket, before committing. Newest log entries first.

## Current state

- Branch: `develop`
- Stack: TypeScript 6.0, Next.js 16 (App Router), React 19, Postgres, Prisma 7.10, pnpm 10
- Features: `home` (folders plus empty `index.ts` and `types.ts`, no logic; `src/app/page.tsx` is a placeholder page so the build works)
- Prisma: schema has generator and datasource only, no models. Not connected to a database.
- Last verified checks (2026-11-20): `pnpm check` (lint, typecheck, test, build) passes, plus `db:validate` and `db:generate`. Tests: 3 passing (`tests/architecture/features.test.ts`).

## Next up

1. Define the first `home` ticket (what the home screen shows).
2. Set up a Postgres database and `.env` (needs a decision on where it runs).
3. Add feature tests under `tests/features/<feature>/` as `home` gets logic.

## Blockers / open questions

- Where does Postgres run (local, Docker, hosted)? Not decided.
- Feature-boundary lint rule verified: a temporary `@/features/home/db/foo` import was rejected, then removed.

## Log

### 2026-11-20 - Test script and build scripts
- Added `tests/architecture/features.test.ts`: every folder in `src/features/` must be kebab-case and contain `components/ api/ db/ hooks/ types.ts index.ts`. It failed on `home` (missing `types.ts`, `index.ts`), so both were added as empty exports.
- Removed `--passWithNoTests` from the `test` script.
- Approved build scripts for `prisma`, `@prisma/engines`, `esbuild` via `pnpm.onlyBuiltDependencies` in `package.json` (read all three scripts first; official installers). `pnpm ignored-builds` now reports none.
- Checks: `pnpm check` passes; 3 tests.

### 2026-11-20 - App initialized
- Added pnpm project: Next.js, React, Prisma, ESLint, Vitest, TypeScript. Configs: `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `prisma.config.ts`.
- Pinned TypeScript to 6.0.3 (typescript-eslint does not support 7.x) and the Prisma CLI to 7.10.1 (matching the client; `latest` resolved to an 8.0 release candidate).
- Defined commands in `CLAUDE.md`; added `pnpm check`.
- Checks: lint, typecheck, test, build, db:validate all pass.

### 2026-11-20 - Repo foundation
- Created repo with `main`, `develop`, `staging`; pushed to GitHub.
- Installed project-scope plugins `mattpocock-skills`, `loop-engineering`; vendored Looper into `.claude/skills/looper/`.
- Chose feature-first single-app structure; wrote `CLAUDE.md` and `src/features/CLAUDE.md`.
- Tests: n/a (no code yet).
