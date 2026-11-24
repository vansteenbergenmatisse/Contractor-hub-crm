import { getPrisma } from "@/shared/lib/prisma";

// Keys Forge Forward locked for one client (table CustomValueLock). A row means locked.

export async function lockedKeysOf(tenantId: string): Promise<ReadonlySet<string>> {
  const rows = await getPrisma().customValueLock.findMany({ where: { tenantId }, select: { key: true } });
  return new Set(rows.map((row) => row.key));
}

// Locking twice keeps the first row (who locked it and when).
export async function lockValue(tenantId: string, key: string, adminId: string): Promise<void> {
  await getPrisma().customValueLock.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, lockedByAdminId: adminId },
    update: {},
  });
}

export async function unlockValue(tenantId: string, key: string): Promise<void> {
  await getPrisma().customValueLock.deleteMany({ where: { tenantId, key } });
}
