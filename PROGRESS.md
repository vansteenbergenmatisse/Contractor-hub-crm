# PROGRESS

Single source of truth for where the project stands. Read it at the start of every session and before every ticket. Update it after every ticket, before committing. Newest log entries first.

## Current state

- Branch: `develop` (pushed to origin). `.env.local` points at the Neon `develop` branch.
- Stack: TypeScript 6.0, Next.js 16 (App Router), React 19, Postgres, Prisma 7.10, pnpm 10
- Features: `home` (folders plus empty `index.ts` and `types.ts`, no logic; `src/app/page.tsx` is a placeholder page so the build works)
- Database: Neon (project `small-fog-37891095`, branch `production`), Postgres only. Prisma 7 + `@prisma/adapter-neon` (lazy `getPrisma()` singleton). Schema still has no models. `GET /api/health/db` returns `{"ok":true,"database":"neondb"}` against Neon.
- Last verified checks (2026-11-20): `pnpm check` (lint, typecheck, test, build) passes, plus `db:validate` and `db:generate`. Tests: 3 passing (`tests/architecture/features.test.ts`).

## Next up

1. Define the first `home` ticket (what the home screen shows).
2. Decide how Neon branches map to `develop`, `staging` and `main` (today only the Neon `production` branch exists and `.env.local` points at it). Avoid developing against production data.
3. Add feature tests under `tests/features/<feature>/` as `home` gets logic.

## Blockers / open questions

- The staging password was pasted into the Claude chat, so it is in the session transcript. Consider rotating it in the Neon console (Roles) once setup is done. Hosting runtime for the app is not decided; The driver is the Neon adapter (your spec); the Neon skill suggested node-postgres for long-running Node/Vercel, but both work here.
- The `neon-postgres` Claude Code plugin was installed at user scope (global) by `neon init`, not project scope.
- CI `check` job verified on GitHub (run on `develop` passed). The `migrate` job has not run yet: it only runs after a merge to `staging`/`main`. GitHub Environments `staging` and `production` exist; I could not verify their `DATABASE_URL_UNPOOLED` secrets (no admin rights for the `gh` login).
- Feature-boundary lint rule verified: a temporary `@/features/home/db/foo` import was rejected, then removed.

## Log

### 2026-11-20 - Develop branch live, pushed
- Neon `develop` branch (`br-steep-shadow-bbk1ch83`) exists. Saved production URLs to `.env.production` (gitignored), then pointed `.env.local` at develop via `neon checkout develop` + `neon env pull`, so local work no longer touches production data.
- Verified: `GET /api/health/db` returned 200 `{"ok":true,"database":"neondb"}` against develop; `prisma migrate status` reached it.
- Pushed `develop` to origin. CI run on develop: success (40s).

### 2026-11-20 - Staging credentials saved
- Neon branch `staging` (`br-bitter-voice-bbb8dn5q`, host `ep-broad-voice-bb2ds4xc`) now exists. Saved pooled and direct URLs to `.env.staging` (gitignored, mode 600). `prisma migrate status` reached it: connection works, no migrations applied yet.

### 2026-11-20 - Database layer per spec
- Switched driver to `@prisma/adapter-neon` (removed `@prisma/adapter-pg`, `pg`); added `dotenv`, `tsx`. `prisma.config.ts` loads `.env.local` then `.env`; reads `DATABASE_URL_UNPOOLED` directly (not `env()`, which throws and would break `prisma generate` in postinstall/CI).
- `getPrisma()` is lazy: the first version built the client on import and `next build` failed without env vars. Fixed and verified.
- Health query needed `::text` (Neon adapter cannot deserialize Postgres `name`).
- `.env.example` now has empty values. Added `.nvmrc` (22), `engines`, and `.github/workflows/ci.yml`.
- Checks: `pnpm check` passes with and without env vars. Live `GET /api/health/db` returned 200 `{"ok":true,"database":"neondb"}`.

### 2026-11-20 - Neon wired
- Ran `neon init` (org `org-dark-paper-44469290`, project `small-fog-37891095`, branch `production`, postgres) via `npx neon@latest`; first attempt failed because the login lacked org access, retried after `neon login`. `neon config plan` and `neon deploy` reported no changes. `.env.local` pulled (5 vars, gitignored).
- Added deps: `@neon/config`, `@neon/env` (from init), `@prisma/adapter-pg@7.10.1`, `pg`, `@types/pg`. Added `neon.ts`, `postinstall: prisma generate`.
- Driver choice per the Neon skill: Prisma with the node-postgres adapter, pooled URL for the app, direct URL for migrations (`prisma.config.ts`).
- Added `src/shared/lib/prisma.ts`, `src/shared/lib/db-health.ts`, `src/app/api/health/db/route.ts`.
- Checks: `pnpm check` passes. Started the built app and `GET /` returned 200; `GET /api/health/db` returned 200 `{"ok":true,"database":"neondb"}`.

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
