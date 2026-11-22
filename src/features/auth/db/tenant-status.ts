import { getPrisma } from "@/shared/lib/prisma";

// True when the tenant's HighLevel app was uninstalled. A missing tenant counts as uninstalled
// (fail closed); `needs_reconnect` does not, so those users can still sign in and see the banner.
export async function isTenantUninstalled(tenantId: string): Promise<boolean> {
  const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
  return !tenant || tenant.status === "uninstalled";
}
