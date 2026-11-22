import type { EmbedAccess, EmbedCandidate, EmbedTenant, UserContext } from "../types";

// Who a HighLevel user is in the CRM: a user with that email, in the tenant of that sub-account.
// Every miss gives the same answer (null), so nobody learns which part failed.
export async function resolveEmbedUser(
  context: UserContext,
  deps: { findCandidate: (query: { email: string; locationId: string }) => Promise<EmbedCandidate | null> },
): Promise<string | null> {
  let found: EmbedCandidate | null;
  try {
    found = await deps.findCandidate({ email: context.email, locationId: context.activeLocation });
  } catch {
    return null;
  }
  if (!found) return null;
  if (found.role !== "owner" && found.role !== "office") return null;
  if (found.disabledAt) return null;
  if (found.tenant.status !== "connected") return null;
  if (context.companyId && found.tenant.companyId && context.companyId !== found.tenant.companyId) return null;
  return found.userId;
}

// Like resolveEmbedUser, but says WHY nobody signs in (a short code for the log) and, when the
// sub-account is installed and connected but the person has no CRM user yet, asks the caller to
// create one. Order: the user if there is one, else the tenant of the sub-account.
export async function resolveEmbedAccess(
  context: UserContext,
  deps: {
    findCandidate: (query: { email: string; locationId: string }) => Promise<EmbedCandidate | null>;
    findTenant: (locationId: string) => Promise<EmbedTenant | null>;
  },
): Promise<EmbedAccess> {
  let found: EmbedCandidate | null;
  let tenant: EmbedTenant | null = null;
  try {
    found = await deps.findCandidate({ email: context.email, locationId: context.activeLocation });
    if (!found) tenant = await deps.findTenant(context.activeLocation);
  } catch {
    return { kind: "denied", reason: "lookup_failed" };
  }
  if (found) {
    if (found.role !== "owner" && found.role !== "office") return { kind: "denied", reason: "role_not_allowed" };
    if (found.disabledAt) return { kind: "denied", reason: "user_disabled" };
    if (found.tenant.status !== "connected") return { kind: "denied", reason: `tenant_${found.tenant.status}` };
    if (context.companyId && found.tenant.companyId && context.companyId !== found.tenant.companyId) {
      return { kind: "denied", reason: "company_mismatch" };
    }
    return { kind: "user", userId: found.userId };
  }
  if (!tenant) return { kind: "denied", reason: "location_not_installed" };
  if (tenant.status !== "connected") return { kind: "denied", reason: `tenant_${tenant.status}` };
  if (context.companyId && tenant.companyId && context.companyId !== tenant.companyId) {
    return { kind: "denied", reason: "company_mismatch" };
  }
  return { kind: "provision", tenantId: tenant.tenantId };
}
