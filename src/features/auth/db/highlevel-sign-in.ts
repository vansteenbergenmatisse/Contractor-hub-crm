import { getPrisma } from "@/shared/lib/prisma";

// The HighLevel sub-account of a personal sign-in link's slug (table TenantSignInLink), only while
// that client is connected and its login is on. Anything else, including a missing table, is null.
export async function findLocationIdBySlug(slug: string): Promise<string | null> {
  try {
    const prisma = getPrisma();
    const link = await prisma.tenantSignInLink.findUnique({ where: { slug }, select: { tenantId: true } });
    if (!link) return null;
    const tenant = await prisma.tenant.findUnique({
      where: { id: link.tenantId },
      select: { status: true, locationId: true, loginLock: { select: { disabledAt: true } } },
    });
    if (!tenant || tenant.status !== "connected" || tenant.loginLock) return null;
    return tenant.locationId;
  } catch {
    return null;
  }
}
