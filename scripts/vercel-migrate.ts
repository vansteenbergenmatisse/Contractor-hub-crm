// The Vercel build's migration step: `pnpm build && pnpm exec tsx scripts/vercel-migrate.ts` (vercel.json).
// The build runs first, so a failing build never migrates. A non-zero exit here fails the Vercel
// build, so the new deployment never goes live and the previous one keeps serving.
// The decision is in vercel-migrate-decide.ts, the run in vercel-migrate-run.ts (both tested).
// Reads only real environment variables (Vercel's). It loads no .env file, so a local run skips.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { runMigrate } from "./vercel-migrate-run";

const { VERCEL, VERCEL_ENV, VERCEL_GIT_COMMIT_REF, DATABASE_URL, DATABASE_URL_UNPOOLED } = process.env;

process.exit(
  runMigrate(
    { VERCEL, VERCEL_ENV, VERCEL_GIT_COMMIT_REF, DATABASE_URL, DATABASE_URL_UNPOOLED },
    {
      spawn: (args) => spawnSync("pnpm", args, { stdio: "inherit", env: process.env }),
      countMigrations: () => readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length,
      info: (line) => console.info(line),
      error: (line) => console.error(line),
    },
  ),
);
