import { Suspense } from "react";
import { hitRateLimit } from "@/features/auth";
import { loadBusiness } from "@/features/brand";
import { createTenantContactsReader, createTenantLocationZoneReader } from "@/features/highlevel";
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
  const readZone = user?.viewing ? createTenantLocationZoneReader(hitRateLimit, { viewerId: user.id }) : createTenantLocationZoneReader(hitRateLimit);
  // The zone read has a short time limit. If it fails, the zone stays unknown.
  const [result, timeZone] = await Promise.all([
    loadLeads(user?.tenantId, reader),
    readZone(user?.tenantId).catch(() => null),
  ]);
  return <LeadsPage result={result} timeZone={timeZone} />;
}

// Thin page. Suspense covers the data and useSearchParams (?add=1).
export default function Page() {
  return (
    <Suspense fallback={<LeadsSkeleton />}>
      <LeadsData />
    </Suspense>
  );
}
