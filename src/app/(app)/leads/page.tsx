import { Suspense } from "react";
import { hitRateLimit } from "@/features/auth";
import { createTenantContactsReader } from "@/features/highlevel";
import { LeadsPage, LeadsSkeleton, loadLeads } from "@/features/leads";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";

// The signed-in tenant's leads. The tenant comes from the session only.
async function LeadsData() {
  const user = await getRequestUser();
  const reader = user?.viewing ? createTenantContactsReader(hitRateLimit, { viewerId: user.id }) : createTenantContactsReader(hitRateLimit);
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
