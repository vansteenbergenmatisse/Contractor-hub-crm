import { getPrisma } from "@/shared/lib/prisma";

// The client the admin values page works on: only a connected tenant. Null otherwise.
export async function connectedTenant(tenantId: string): Promise<{ name: string } | null> {
  const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId }, select: { name: true, status: true } });
  return tenant?.status === "connected" ? { name: tenant.name ?? "" } : null;
}
