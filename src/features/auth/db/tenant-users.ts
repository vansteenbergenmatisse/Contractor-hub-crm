import { getPrisma } from "@/shared/lib/prisma";

// Ids of the non-admin users of one tenant; null when the tenant does not exist. Admins have no
// tenant, so they can never be returned here.
export async function listTenantUserIds(tenantId: string): Promise<string[] | null> {
  const prisma = getPrisma();
  if (!(await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }))) return null;
  const users = await prisma.user.findMany({ where: { tenantId, role: { not: "admin" } }, select: { id: true } });
  return users.map((user) => user.id);
}
