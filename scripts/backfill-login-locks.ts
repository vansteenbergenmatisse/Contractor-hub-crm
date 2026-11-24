// Lists clients that are already off but have no TenantLoginLock row. Writes nothing by default.
//   pnpm exec tsx scripts/backfill-login-locks.ts            dry run
//   CONFIRM_HOST=<host> pnpm exec tsx scripts/backfill-login-locks.ts --apply --tenants=<id,id> [--exclude=<id,id>]
// Every client in the dry run's "already off" list must be in --tenants or --exclude, or nothing is written.
// Uses the database in .env.local (Neon develop) unless the shell already exports one.
// Order and review steps: docs/login-lock-rollout.md.
import { config } from "dotenv";

const presetDatabase = process.env.DATABASE_URL !== undefined || process.env.DATABASE_URL_UNPOOLED !== undefined;
config({ path: ".env.local", quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  const host = new URL(databaseUrl).host; // never the full URL
  console.info(`Target database host: ${host}${presetDatabase ? " (from your shell, not .env.local)" : " (.env.local)"}`);
  if (args.includes("--apply") && process.env.CONFIRM_HOST !== host) {
    throw new Error("--apply writes to this database. Re-run with CONFIRM_HOST set to the host shown above.");
  }
  // Deep imports on purpose: the feature's index.ts also exports React components.
  const { runReviewedLoginLockBackfill } = await import("../src/features/admin/api/login-lock-backfill");
  const { createLoginLocks, readLoginLockBackfillInput } = await import("../src/features/admin/db/login-lock-backfill");
  const result = await runReviewedLoginLockBackfill(args, {
    read: readLoginLockBackfillInput,
    createLocks: createLoginLocks,
    log: (line) => console.info(line),
  });
  if (result.problems.length > 0) throw new Error("Nothing was written. Run the dry run and review again.");
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error("Failed:", error instanceof Error ? error.message : "unknown error");
    process.exit(1);
  },
);
