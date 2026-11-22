import { getPrisma } from "@/shared/lib/prisma";
import type { EmbedCandidate } from "../types";

// The CRM user with this email whose tenant is the HighLevel sub-account `locationId`.
// Emails are stored lower case (see createInvitedUser).
export async function findEmbedCandidate(query: { email: string; locationId: string }): Promise<EmbedCandidate | null> {
  const user = await getPrisma().user.findFirst({
    where: { email: query.email, tenant: { locationId: query.locationId } },
    select: { id: true, role: true, disabledAt: true, tenant: { select: { status: true, companyId: true } } },
  });
  if (!user || !user.tenant) return null;
  return { userId: user.id, role: user.role, disabledAt: user.disabledAt, tenant: user.tenant };
}
