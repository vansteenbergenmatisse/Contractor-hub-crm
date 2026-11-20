# PROGRESS

Single source of truth for where the project stands. Read it at the start of every session and before every ticket. Update it after every ticket, before committing. Newest log entries first.

## Current state

- Branch: `develop`
- Stack: TypeScript 6.0, Next.js 16 (App Router), React 19, Postgres, Prisma 7.10, pnpm 10
- Features: `home` (folders only, no code; `src/app/page.tsx` is a placeholder page so the build works)
- Prisma: schema has generator and datasource only, no models. Not connected to a database.
- Last verified checks (2026-11-20): `pnpm lint`, `typecheck`, `test`, `build`, `db:validate` all pass. `test` passes with no test files (`--passWithNoTests`).

## Next up

1. Define the first `home` ticket (what the home screen shows).
2. Set up a Postgres database and `.env` (needs a decision on where it runs).
3. Add the first real test and remove `--passWithNoTests` from the `test` script.

## Blockers / open questions

- Where does Postgres run (local, Docker, hosted)? Not decided.
- pnpm reported that some dependency build scripts were not approved (`pnpm approve-builds`). Build and checks work without them. Not yet reviewed which packages they are.
- Feature-boundary lint rule verified: a temporary `@/features/home/db/foo` import was rejected, then removed.

## Log

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
