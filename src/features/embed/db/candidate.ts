import { getPrisma } from "@/shared/lib/prisma";
import type { EmbedCandidate, EmbedTenant } from "../types";

// The CRM user with this email whose tenant is the HighLevel sub-account `locationId`.
// Emails are stored lower case (see createInvitedUser).
export async function findEmbedCandidate(query: { email: string; locationId: string }): Promise<EmbedCandidate | null> {
  const user = await getPrisma().user.findFirst({
    where: { email: query.email, tenant: { locationId: query.locationId } },
    select: { id: true, role: true, disabledAt: true, tenant: { select: { status: true, companyId: true, loginLock: { select: { disabledAt: true } } } } },
  });
  if (!user || !user.tenant) return null;
  const { loginLock, ...tenant } = user.tenant;
  return { userId: user.id, role: user.role, disabledAt: user.disabledAt, tenant: { ...tenant, loginDisabledAt: loginLock?.disabledAt ?? null } };
}

// The tenant of a HighLevel sub-account, or null when the app is not installed there.
export async function findEmbedTenant(locationId: string): Promise<EmbedTenant | null> {
  const tenant = await getPrisma().tenant.findUnique({
    where: { locationId },
    select: { id: true, status: true, companyId: true, loginLock: { select: { disabledAt: true } } },
  });
  return tenant ? { tenantId: tenant.id, status: tenant.status, companyId: tenant.companyId, loginDisabledAt: tenant.loginLock?.disabledAt ?? null } : null;
}
