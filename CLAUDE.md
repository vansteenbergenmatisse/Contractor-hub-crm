# Contractor-hub-crm

CRM for contractors. Remote: https://github.com/vansteenbergenmatisse/Contractor-hub-crm

**Start every session by reading `PROGRESS.md`** (current state, next up, blockers). It is the source of truth for where the project stands.

Stack (decided): TypeScript, Next.js (App Router), Postgres on Neon, Prisma 7 with the Neon driver adapter (`@prisma/adapter-neon`). Package manager: pnpm, the only one. Never use npm or yarn; never commit another lockfile.

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

TypeScript is pinned to 6.0.x because `typescript-eslint` does not support 7.x yet. Prisma CLI and client are pinned to the same version. Do not bump either without running `pnpm check`. 
## Database (Neon)

- Neon project `small-fog-37891095` (org `org-dark-paper-44469290`), branch `production`, services: Postgres only. Declared in `neon.ts`. Use `pnpm dlx neon@latest` for the CLI (no global install).
- Env vars live in `.env.local` (gitignored, written by Neon; refresh with `neon env pull`). `.env.example` shows the shape. Never print or commit real URLs.
- `DATABASE_URL` is the pooled URL, used by the app. `DATABASE_URL_UNPOOLED` is the direct URL, used by Prisma migrations (`prisma.config.ts` loads `.env.local` itself).
- The Prisma client comes from `getPrisma()` in `@/shared/lib/prisma` (lazy singleton, so the build needs no env). Only a feature's `db/` files call it. Do not create another client.
- Generated client goes to `src/generated/prisma` (gitignored). It is built by `postinstall`; run `pnpm db:generate` after schema changes.
- Health check: `GET /api/health/db` runs `SELECT current_database()`. Use it to verify the connection.
- Environments (one Neon branch each): `main` → Neon `production`, `staging` → `staging`, `develop` → `develop`. Same env var names everywhere; values differ per branch. All three Neon branches exist. Local files (all gitignored): `.env.local` = **develop** (the default for local work; written by `neon env pull` with the `.neon` pin on develop), `.env.staging` = staging, `.env.production` = production (URLs only). To target another branch: `set -a; . ./.env.staging; set +a; pnpm exec prisma <cmd>` (real env vars override the dotenv files). Never point `.env.local` at production.
- `prisma migrate dev` runs only against `develop`. CI (`.github/workflows/ci.yml`) runs `prisma migrate deploy` on merge to `staging` and `main`, using that environment's `DATABASE_URL_UNPOOLED` from GitHub Environments. Never run `migrate dev` or `db push` against staging or production.
- Do not add `pgbouncer=true` or `connection_limit` to URLs. Pool size is set in the adapter (`src/shared/lib/prisma.ts`). Free-plan computes sleep after 5 minutes idle, so the first connection is slow (connect timeout is 10s).
- Node 22.12+ (`.nvmrc`, `engines`).
- Test a migration on a Neon branch of production before applying it to production. Do not run `neon deploy`, migrations or branch changes without approval.

## Rules

- Keep the frontend design as it is. Only wire it up. Exception (user, 2026-11-22): small changes that apply the UX laws in `docs/ux-laws.md` are allowed. Follow that file when wiring a page.
- Add a client or install the HighLevel app only by following `docs/sop-highlevel-install.md`.
- Fix the code when a test fails. Leave the test file alone.
- After each ticket run all tests and update PROGRESS.md. Then commit.
- If two rounds in a row make no progress stop and write why in PROGRESS.md.

## Recording work (mandatory)

Every change, edit or addition to the repo is recorded in `PROGRESS.md`, first as a plan and then as a result. This includes code, config, dependencies, schema, docs, CI, env-file conventions, new folders, deletions, and external changes (Neon, GitHub, Vercel, HighLevel).

1. **Before acting:** add an entry under "In progress" in `PROGRESS.md` with the date, what you are going to do, which files or systems it touches, and why. Do this before the first edit, not after.
2. **While working:** if the plan changes, edit the "In progress" entry to say so. Do not silently drift from it.
3. **After acting:** move the entry to the top of "Log" and rewrite it as what actually happened: files changed, commands run, the check result (`pnpm check` output summary), anything that failed or was skipped. Say so plainly if something was not verified.
4. **Same commit:** the `PROGRESS.md` update goes in the same commit as the change it describes. Update "Current state", "Next up" and "Blockers" when they are affected.
5. **No secrets:** never write passwords, tokens or full connection strings in `PROGRESS.md`. Name the variable or file instead.
6. **Not recorded means not done.** If a session ends mid-task, the "In progress" entry is what the next session resumes from.
7. Long-form notes (runbooks, integration plans) go in `docs/<topic>.md` and are linked from `PROGRESS.md`.

Also record decisions the user makes in chat (hosting, stack, scope) under "Current state" or "Log" as soon as they are made.

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
PROGRESS.md             Running log: resume guide, current state, plans, blockers, history
docs/                   Long-form notes and plans (e.g. docs/gohighlevel-integration.md)
```

Existing features: `today`, `highlevel`, `auth`, `brand`, `admin`, `embed`, `app-shell`, `onboarding`, `inbox`, `pipeline`, `calendar`, `routes`, `leads`, `quotes`, `invoices`, `payments`, `automations`, `settings`, `settings-write-back`, `mailbox-prompt`, `alerts`.

Signed-in pages live in the route group `src/app/(app)/` (one layout: session guard, business details, search rows). Leads, Today lead rows, Inbox, Pipeline and Calendar read real HighLevel data. Quotes, Invoices, Payments and Automations read real data only where their `*_PAGE_LIVE` server flag is on and show "Not available yet" otherwise. Data writes to a client's HighLevel sit behind off-by-default flags with a tenant list, for example: Settings write-back (`SETTINGS_WRITE_BACK_*`, `SETTINGS_MEDIA_REPLACE_*`), Routes notify (`ROUTES_NOTIFY_*`) and New lead create (`LEADS_CREATE_*`); see `.env.example`. Admin View as client and token renewal: `docs/view-as-client-and-token-renewal.md`. Read before changing them: `docs/greenlane/plan.md` (includes the rule that NO automation is written in this app: automations are HighLevel workflows, set up once and copied per client), `docs/tenant-branding.md` (every client's own colors, logo, name and details come from its custom values; the installable app), `docs/onboarding.md` (sub-account sync, users, email, decisions and open risks).

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
- Commit after every major step (a schema change, a finished module with its tests, a finished page, a docs or config change), not only at the end of a ticket, so the log explains each step. Each commit passes `pnpm check` and updates `PROGRESS.md` in the same commit. The body says what changed and why. Message format: `<type>(<feature>): <summary>` with type one of `feat`, `fix`, `refactor`, `test`, `docs`, `chore`. Example: `feat(today): add pipeline summary card`.
- Stage files by name. Do not commit `.env*`, secrets or `.claude/skills/looper/.venv/`.
- Do not push, force-push, merge or delete branches without explicit approval.
- Hosting is Vercel. GitHub Actions CI (`.github/workflows/ci.yml`) must pass before merging.

## Per-ticket loop

1. Read `PROGRESS.md`, the ticket and the owning feature folder. Write the plan under "In progress" in `PROGRESS.md` (see "Recording work").
2. Write or update the test first, then the code (use the `mattpocock-skills:tdd` skill).
3. Run `pnpm check`. Fix the code, not the tests, until it passes.
4. Update `PROGRESS.md`: move the "In progress" entry to "Log" as what actually happened (what changed, check result, next step), and update "Current state", "Next up" and blockers.
5. Commit with the format above. Then re-read "Next up" in `PROGRESS.md` before starting the next ticket.

`PROGRESS.md` is also where you stop: if two rounds in a row make no progress, write why under "Blockers / open questions" and stop. Update it when a feature is added, when a decision is made, and when a check starts failing.

## Local tooling

- Plugins (project scope, in `.claude/settings.json`): `mattpocock-skills`, `loop-engineering`.
- Looper is vendored in `.claude/skills/looper/` (see `VENDORED.md`). After a fresh clone recreate its venv: `python3 -m venv .claude/skills/looper/.venv && .claude/skills/looper/.venv/bin/python -m pip install "PyYAML>=6.0"`.
