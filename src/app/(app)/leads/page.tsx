import { Suspense } from "react";
import { hitRateLimit } from "@/features/auth";
import { loadBusiness } from "@/features/brand";
import { createTenantContactsReader } from "@/features/highlevel";
import { LeadsPage, LeadsSkeleton, loadLeads } from "@/features/leads";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";

// The signed-in tenant's leads. The tenant comes from the session only.
async function LeadsData() {
  const user = await getRequestUser();
  const business = user?.tenantId
    ? await (user.viewing ? loadBusiness(user.tenantId, "", true) : loadBusiness(user.tenantId, user.name))
    : null;
  const ownEmail = business?.email ?? null;
  const reader = createTenantContactsReader(hitRateLimit, user?.viewing ? { viewerId: user.id, ownEmail } : { ownEmail });
  const result = await loadLeads(user?.tenantId, reader);
  return <LeadsPage result={result} />;
}

// Thin page. Suspense covers the data and useSearchParams (?add=1).
export default function Page() {
  return (
    <Suspense fallback={<LeadsSkeleton />}>
      <LeadsData />
    </Suspense>
  );
}
