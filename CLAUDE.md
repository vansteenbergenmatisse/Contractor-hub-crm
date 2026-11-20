# Contractor-hub-crm

CRM for contractors. Remote: https://github.com/vansteenbergenmatisse/Contractor-hub-crm

**Start every session by reading `PROGRESS.md`** (current state, next up, blockers). It is the source of truth for where the project stands.

Stack (decided): TypeScript, Next.js (App Router), Postgres, Prisma. Package manager: pnpm, the only one. Never use npm or yarn; never commit another lockfile.

## Commands

| Task | Command |
|---|---|
| Dev server | `pnpm dev` |
| Lint | `pnpm lint` (eslint, includes the feature-boundary import rule) |
| Typecheck | `pnpm typecheck` (`tsc --noEmit`) |
| Test | `pnpm test` (vitest, files in `tests/**/*.test.ts(x)`) |
| Build | `pnpm build` (`next build`) |
| All checks | `pnpm check` (lint, typecheck, test, build in order) |
| Prisma | `pnpm db:validate`, `pnpm db:generate` |

TypeScript is pinned to 6.0.x because `typescript-eslint` does not support 7.x yet. Prisma CLI and client are pinned to the same version. Do not bump either without running `pnpm check`. The database URL lives in `.env` (gitignored); `.env.example` shows the shape.

## Rules

- Keep the frontend design as it is. Only wire it up.
- Fix the code when a test fails. Leave the test file alone.
- After each ticket run all tests and update PROGRESS.md. Then commit.
- If two rounds in a row make no progress stop and write why in PROGRESS.md.

## Folder structure (feature-first, single app)

```
src/
  app/                  Next.js routing only. Thin pages that compose features. No business logic.
  features/
    <feature>/          One folder per feature. Everything for that feature lives here.
      components/       React UI for this feature
      api/              Route handlers / server actions for this feature
      db/               Prisma queries for this feature (the only place it touches the DB)
      hooks/            Client hooks
      types.ts          Types shared inside the feature
      index.ts          Public API. The only file other code may import from.
  shared/
    ui/                 Generic primitives (button, input, layout). No business logic, no data fetching.
    lib/                Generic helpers (dates, formatting, http client)
    config/             Env parsing and constants
prisma/schema.prisma    Single schema, one section per feature (comment header per feature)
tests/                  Mirrors src/ (tests/features/<feature>/...)
.claude/                Project plugins, skills, commands (committed)
PROGRESS.md             Running log of tickets, status, blockers
```

Existing features: `home`.

## Adding code

- New feature: create `src/features/<kebab-name>/` with `components/ api/ db/ hooks/ types.ts index.ts`, a matching `tests/features/<name>/`, and a schema section in `prisma/schema.prisma` if it needs data. Add the name to "Existing features" above.
- Code goes in the feature that owns it. If two features need it and it has no business meaning, move it to `src/shared/`. If it has business meaning, keep it in one feature and expose it through that feature's `index.ts`.
- Cross-feature imports go through `src/features/<other>/index.ts` only. Never import another feature's internal files. Never import from `src/app/`.
- Pages in `src/app/` import features and render them. They contain no queries and no business rules.
- Only `db/` files call Prisma. Components and routes call `db/` through the feature's `api/`.
- No catch-all `components/`, `utils/` or `hooks/` folders at the top level. Their content belongs to a feature or to `shared/`.
- Names: folders and files kebab-case, components PascalCase exports, one component per file.

## Changing code

- Read the feature's folder and `index.ts` first. Change the smallest area that solves the ticket.
- Do not refactor unrelated code in the same change.
- Schema changes: edit `prisma/schema.prisma`, create a migration, never edit applied migrations. Ask before applying a migration or touching real data.
- Do not install dependencies or edit lockfiles without approval. Log any approved dependency change in `PROGRESS.md`.

## Git workflow

- Branches: `develop` (daily work), `staging` (pre-release), `main` (production). Work on `develop` or a short branch from it named `feat/<feature>-<short>` or `fix/<feature>-<short>`.
- Promotion is `develop` → `staging` → `main` via pull request. Never commit straight to `staging` or `main`.
- One commit per ticket, made after tests pass and PROGRESS.md is updated. Message format: `<type>(<feature>): <summary>` with type one of `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Example: `feat(home): add pipeline summary card`.
- Stage files by name. Do not commit `.env*`, secrets or `.claude/skills/looper/.venv/`.
- Do not push, force-push, merge or delete branches without explicit approval.

## Per-ticket loop

1. Read `PROGRESS.md`, the ticket and the owning feature folder.
2. Write or update the test first, then the code (use the `mattpocock-skills:tdd` skill).
3. Run `pnpm check`. Fix the code, not the tests, until it passes.
4. Update `PROGRESS.md`: "Current state", "Next up", and a new "Log" entry (what changed, check result, next step). Record blockers there too.
5. Commit with the format above. Then re-read "Next up" in `PROGRESS.md` before starting the next ticket.

`PROGRESS.md` is also where you stop: if two rounds in a row make no progress, write why under "Blockers / open questions" and stop. Update it when a feature is added, when a decision is made, and when a check starts failing.

## Local tooling

- Plugins (project scope, in `.claude/settings.json`): `mattpocock-skills`, `loop-engineering`.
- Looper is vendored in `.claude/skills/looper/` (see `VENDORED.md`). After a fresh clone recreate its venv: `python3 -m venv .claude/skills/looper/.venv && .claude/skills/looper/.venv/bin/python -m pip install "PyYAML>=6.0"`.
