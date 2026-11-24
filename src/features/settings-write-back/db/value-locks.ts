import { getPrisma } from "@/shared/lib/prisma";
import { orMigrationPending } from "@/shared/lib/migration-pending";

// Keys Forge Forward locked for one client (table CustomValueLock). A row means locked.
// On a database without the table every call throws MigrationPendingError naming this migration.
export const CUSTOM_VALUE_LOCK_MIGRATION = "20261124120000_custom_value_lock";

export async function lockedKeysOf(tenantId: string): Promise<ReadonlySet<string>> {
  const rows = await orMigrationPending(CUSTOM_VALUE_LOCK_MIGRATION, () =>
    getPrisma().customValueLock.findMany({ where: { tenantId }, select: { key: true } }),
  );
  return new Set(rows.map((row) => row.key));
}

// Locking twice keeps the first row (who locked it and when).
export async function lockValue(tenantId: string, key: string, adminId: string): Promise<void> {
  await orMigrationPending(CUSTOM_VALUE_LOCK_MIGRATION, () =>
    getPrisma().customValueLock.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: { tenantId, key, lockedByAdminId: adminId },
      update: {},
    }),
  );
}

export async function unlockValue(tenantId: string, key: string): Promise<void> {
  await orMigrationPending(CUSTOM_VALUE_LOCK_MIGRATION, () => getPrisma().customValueLock.deleteMany({ where: { tenantId, key } }));
}
