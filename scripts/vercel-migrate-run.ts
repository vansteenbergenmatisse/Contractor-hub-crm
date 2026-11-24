// Runs the decision from vercel-migrate-decide.ts. Spawning Prisma, counting migration folders and
// logging are passed in, so the exit code is tested without a database (tests/scripts/vercel-migrate.test.ts).
import { decide, type MigrateEnv } from "./vercel-migrate-decide";

export type RunDeps = {
  // Runs `pnpm exec prisma <args>`. `status` null: killed by a signal or did not start.
  spawn: (args: string[]) => { status: number | null };
  countMigrations: () => number;
  info: (line: string) => void;
  error: (line: string) => void;
};

// Exit code for the build: 0 continue, 1 fail the deployment.
export function runMigrate(env: MigrateEnv, deps: RunDeps): number {
  const decision = decide(env);
  if (decision.action === "skip" || decision.action === "warn") {
    deps.info(decision.message);
    return 0;
  }
  if (decision.action === "refuse") {
    deps.error(decision.message);
    return 1;
  }
  const count = deps.countMigrations();
  deps.info(`${decision.message} migrations_in_repo=${count}`);
  // Prisma prints the database host and name and the migration names, never the password.
  const run = deps.spawn(["exec", "prisma", ...decision.command]);
  const ok = run.status === 0;
  const verb = decision.action === "deploy" ? (ok ? "applied or already applied" : "FAILED") : ok ? "none pending" : "PENDING or unreachable";
  const line = `Release migrations: ${decision.action} ${decision.target} migrations_in_repo=${count} result=${verb}`;
  if (ok) deps.info(line);
  else deps.error(line);
  return ok ? 0 : 1;
}
