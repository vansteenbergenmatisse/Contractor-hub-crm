import { getPrisma } from "@/shared/lib/prisma";

// True when the tenant's HighLevel app was uninstalled. A missing tenant counts as uninstalled
// (fail closed); `needs_reconnect` does not, so those users can still sign in and see the banner.
export async function isTenantUninstalled(tenantId: string): Promise<boolean> {
  const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
  return !tenant || tenant.status === "uninstalled";
}

// True when a user of this tenant may not hold a session: uninstalled, missing, or login turned off.
// View as client does not use this, so an admin can still open a client whose login is off.
export async function isTenantLoginBlocked(tenantId: string): Promise<boolean> {
  const tenant = await getPrisma().tenant.findUnique({ where: { id: tenantId }, select: { status: true, loginLock: { select: { tenantId: true } } } });
  return !tenant || tenant.status === "uninstalled" || tenant.loginLock !== null;
}

export async function isTenantLoginOff(tenantId: string): Promise<boolean> {
  return (await getPrisma().tenantLoginLock.count({ where: { tenantId } })) > 0;
}

export async function setTenantLoginDisabled(tenantId: string, disabled: boolean): Promise<void> {
  if (disabled) await getPrisma().tenantLoginLock.upsert({ where: { tenantId }, create: { tenantId }, update: {} });
  else await getPrisma().tenantLoginLock.deleteMany({ where: { tenantId } });
}
