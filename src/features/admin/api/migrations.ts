import { readMigrationRows } from "../db/migrations";
import type { MigrationRow, MigrationsView } from "../types";
import { MIGRATION_MANIFEST } from "./migration-manifest";

// Compares the migrations this code expects (the manifest) with Prisma's history table.
// `rows` null: the history table does not exist, so every migration is pending.
// A name is applied when one of its rows finished and was not rolled back. A failed (never finished)
// or rolled-back row is listed only while that name has no applied row.
export function compareMigrations(manifest: readonly string[], rows: readonly MigrationRow[] | null): Pick<MigrationsView, "applied" | "pending" | "problems" | "notInCode" | "historyMissing"> {
  const list = rows ?? [];
  const applied = new Set(list.filter((row) => row.finishedAt !== null && row.rolledBackAt === null).map((row) => row.name));
  const problems = list
    .filter((row) => !applied.has(row.name) && (row.rolledBackAt !== null || row.finishedAt === null))
    .map((row) => ({ name: row.name, state: row.rolledBackAt !== null ? ("rolled_back" as const) : ("failed" as const) }));
  const known = new Set(manifest);
  return {
    applied: manifest.filter((name) => applied.has(name)),
    pending: manifest.filter((name) => !applied.has(name)),
    problems,
    notInCode: [...applied].filter((name) => !known.has(name)),
    historyMissing: rows === null,
  };
}

// Vercel's own system variables name the environment; locally neither is set.
function environmentName(): { environment: string; ref: string | null } {
  return { environment: process.env.VERCEL_ENV || "local", ref: process.env.VERCEL_GIT_COMMIT_REF || null };
}

// For /admin/migrations. A failed read is shown as such, never as "none pending".
export async function loadMigrationsView(read: () => Promise<MigrationRow[] | null> = readMigrationRows): Promise<MigrationsView> {
  const where = environmentName();
  try {
    const rows = await read();
    const compared = compareMigrations(MIGRATION_MANIFEST, rows);
    console.info(`Admin migrations read: applied=${compared.applied.length} pending=${compared.pending.length}`);
    return { ...where, expected: MIGRATION_MANIFEST.length, ...compared };
  } catch {
    console.error("Admin migrations did not load: step=read");
    return { ...where, expected: MIGRATION_MANIFEST.length, applied: [], pending: [], problems: [], notInCode: [], historyMissing: false, readError: true };
  }
}
