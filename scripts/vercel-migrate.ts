// The Vercel build's migration step: `pnpm exec tsx scripts/vercel-migrate.ts && pnpm build` (vercel.json).
// The decision is in vercel-migrate-decide.ts (tested). This file only runs it.
// A failed migration fails the build, so code that needs it never goes live.
// Reads only real environment variables (Vercel's). It loads no .env file, so a local run skips.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { decide } from "./vercel-migrate-decide";

function migrationsInRepo(): number {
  return readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
}

function main(): number {
  const { VERCEL_ENV, VERCEL_GIT_COMMIT_REF, DATABASE_URL, DATABASE_URL_UNPOOLED } = process.env;
  const decision = decide({ VERCEL_ENV, VERCEL_GIT_COMMIT_REF, DATABASE_URL, DATABASE_URL_UNPOOLED });
  if (decision.action === "skip" || decision.action === "warn") {
    console.info(decision.message);
    return 0;
  }
  if (decision.action === "refuse") {
    console.error(decision.message);
    return 1;
  }
  const count = migrationsInRepo();
  console.info(`${decision.message} migrations_in_repo=${count}`);
  // Prisma prints the database host and the migration names, never the password.
  const run = spawnSync("pnpm", ["exec", "prisma", ...decision.command], { stdio: "inherit", env: process.env });
  const ok = run.status === 0;
  const verb = decision.action === "deploy" ? (ok ? "applied or already applied" : "FAILED") : ok ? "none pending" : "PENDING or unreachable";
  const line = `Release migrations: ${decision.action} ${decision.target} migrations_in_repo=${count} result=${verb}`;
  if (ok) console.info(line);
  else console.error(line);
  return ok ? 0 : 1;
}

process.exit(main());
