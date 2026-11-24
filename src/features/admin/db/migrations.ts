import { getPrisma } from "@/shared/lib/prisma";
import type { MigrationRow } from "../types";

// Prisma's own history table. Read only. Null: the table does not exist (no migration ever ran here).
// The existence check comes first so a missing table is an answer, not an error.
export async function readMigrationRows(): Promise<MigrationRow[] | null> {
  const prisma = getPrisma();
  const [table] = await prisma.$queryRaw<{ present: boolean }[]>`SELECT to_regclass('_prisma_migrations') IS NOT NULL AS present`;
  if (!table?.present) return null;
  return prisma.$queryRaw<MigrationRow[]>`
    SELECT migration_name AS name, finished_at AS "finishedAt", rolled_back_at AS "rolledBackAt"
    FROM "_prisma_migrations"
    ORDER BY started_at`;
}
