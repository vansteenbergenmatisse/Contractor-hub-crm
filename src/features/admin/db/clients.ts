import { getPrisma } from "@/shared/lib/prisma";
import { toClientRow } from "../api/clients";
import type { ClientRow } from "../types";

// Every tenant with its user counts (admins have no tenant, so they are never counted).
export async function listClients(): Promise<ClientRow[]> {
  const prisma = getPrisma();
  const [tenants, users] = await Promise.all([
    prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, locationId: true, status: true },
    }),
    prisma.user.findMany({ where: { tenantId: { not: null } }, select: { tenantId: true, disabledAt: true } }),
  ]);
  const counts = new Map<string, { users: number; active: number }>();
  for (const user of users) {
    if (!user.tenantId) continue;
    const entry = counts.get(user.tenantId) ?? { users: 0, active: 0 };
    entry.users += 1;
    if (!user.disabledAt) entry.active += 1;
    counts.set(user.tenantId, entry);
  }
  return tenants.map((tenant) => {
    const entry = counts.get(tenant.id) ?? { users: 0, active: 0 };
    return toClientRow(tenant, entry.users, entry.active);
  });
}
