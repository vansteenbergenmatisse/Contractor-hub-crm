import { Suspense } from "react";
import { hitRateLimit } from "@/features/auth";
import { createTenantCalendarReader } from "@/features/highlevel";
import { RoutesLivePage, RoutesSkeleton, isRoutesNotifyEnabled, loadNotifyView, loadRoutes, readStartOutcomes } from "@/features/routes";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";

// The signed-in tenant's jobs today. The tenant comes from the session only.
async function RoutesData() {
  const user = await getRequestUser();
  const reader = user?.viewing ? createTenantCalendarReader(hitRateLimit, { viewerId: user.id }) : createTenantCalendarReader(hitRateLimit);
  const result = await loadRoutes(user?.tenantId, reader);
  const notify = await loadNotifyView(user, result, { isEnabled: (tenantId) => isRoutesNotifyEnabled(tenantId), readOutcomes: readStartOutcomes });
  return <RoutesLivePage result={result} notify={notify} />;
}

// Thin page. Suspense covers the data.
export default function Page() {
  return (
    <Suspense fallback={<RoutesSkeleton />}>
      <RoutesData />
    </Suspense>
  );
}
