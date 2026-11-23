import { getPrisma } from "@/shared/lib/prisma";

// Ids of the non-admin users of one tenant; null when the tenant does not exist. Admins have no
// tenant, so they can never be returned here.
// `excludeRemoved` also leaves out users whose HighLevel link is marked deleted.
export async function listTenantUserIds(tenantId: string, options: { excludeRemoved?: boolean } = {}): Promise<string[] | null> {
  const prisma = getPrisma();
  if (!(await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }))) return null;
  const users = await prisma.user.findMany({ where: { tenantId, role: { not: "admin" } }, select: { id: true } });
  const ids = users.map((user) => user.id);
  if (!options.excludeRemoved) return ids;
  const removed = await prisma.ghlUserLink.findMany({ where: { userId: { in: ids }, deletedAt: { not: null } }, select: { userId: true } });
  const removedIds = new Set(removed.map((link) => link.userId));
  return ids.filter((id) => !removedIds.has(id));
}
