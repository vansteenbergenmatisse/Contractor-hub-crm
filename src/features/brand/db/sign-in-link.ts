import { getPrisma } from "@/shared/lib/prisma";
import { slugFromName, uniqueSlug } from "../api/sign-in-brand";

// The tenant of a slug, only while that client is connected. An unknown slug, a removed tenant and
// an uninstalled or disconnected client all answer null.
export async function findConnectedTenantBySlug(slug: string): Promise<string | null> {
  const prisma = getPrisma();
  const link = await prisma.tenantSignInLink.findUnique({ where: { slug }, select: { tenantId: true } });
  if (!link) return null;
  const tenant = await prisma.tenant.findUnique({ where: { id: link.tenantId }, select: { status: true } });
  return tenant?.status === "connected" ? link.tenantId : null;
}

// Each client's slug, creating the missing ones. An existing row is never changed, so a link keeps
// working after the business is renamed. Two admins at once: `skipDuplicates` lets one win and the
// re-read returns what was stored. While the table is missing this gives an empty map.
export async function ensureSignInSlugs(tenants: { id: string; name: string | null }[]): Promise<Map<string, string>> {
  try {
    const prisma = getPrisma();
    const select = { tenantId: true, slug: true } as const;
    let rows = await prisma.tenantSignInLink.findMany({ select });
    const known = new Set(rows.map((row) => row.tenantId));
    const taken = new Set(rows.map((row) => row.slug));
    const data: { tenantId: string; slug: string }[] = [];
    for (const tenant of tenants) {
      if (known.has(tenant.id)) continue;
      const slug = uniqueSlug(slugFromName(tenant.name), taken);
      taken.add(slug);
      data.push({ tenantId: tenant.id, slug });
    }
    if (data.length > 0) {
      await prisma.tenantSignInLink.createMany({ data, skipDuplicates: true });
      rows = await prisma.tenantSignInLink.findMany({ select });
    }
    return new Map(rows.map((row) => [row.tenantId, row.slug]));
  } catch {
    return new Map();
  }
}
