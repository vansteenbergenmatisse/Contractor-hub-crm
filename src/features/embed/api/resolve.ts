import type { EmbedCandidate, UserContext } from "../types";

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
