import { getPrisma } from "@/shared/lib/prisma";

// Reads and small writes the onboarding sync needs. Tokens never pass through here.

export async function listAgencyCompanyIds(): Promise<string[]> {
  const rows = await getPrisma().hlAgencyConnection.findMany({ select: { companyId: true } });
  return rows.map((row) => row.companyId);
}

// Tenants of one agency that are connected, by HighLevel location id.
export async function listConnectedTenants(companyId: string): Promise<Array<{ tenantId: string; locationId: string }>> {
  const rows = await getPrisma().tenant.findMany({
    where: { companyId, status: "connected" },
    select: { id: true, locationId: true },
  });
  return rows.map((row) => ({ tenantId: row.id, locationId: row.locationId }));
}

export async function findTenantByLocation(locationId: string): Promise<{ tenantId: string; companyId: string | null; status: string } | null> {
  const tenant = await getPrisma().tenant.findUnique({ where: { locationId }, select: { id: true, companyId: true, status: true } });
  return tenant ? { tenantId: tenant.id, companyId: tenant.companyId, status: tenant.status } : null;
}

// LocationUpdate: keep the display name in step. A blank name changes nothing.
export async function updateTenantName(locationId: string, name: string): Promise<boolean> {
  // Control characters out, length capped: the name ends up in mails and the admin page.
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);
  if (!clean) return false;
  const result = await getPrisma().tenant.updateMany({ where: { locationId }, data: { name: clean } });
  return result.count > 0;
}
