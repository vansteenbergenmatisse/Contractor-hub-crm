import { Suspense } from "react";
import { hitRateLimit } from "@/features/auth";
import { loadBusiness } from "@/features/brand";
import { CalendarLivePage, CalendarSkeleton, liveFreeTimes, loadCalendar } from "@/features/calendar";
import { createTenantCalendarReader } from "@/features/highlevel";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";

type Query = Promise<{ week?: string | string[] }>;

// The signed-in tenant's week. The tenant comes from the session only.
async function CalendarData({ searchParams }: { searchParams?: Query }) {
  const user = await getRequestUser();
  const week = (await searchParams)?.week;
  const reader = user?.viewing ? createTenantCalendarReader(hitRateLimit, { viewerId: user.id }) : createTenantCalendarReader(hitRateLimit);
  const result = await loadCalendar(user?.tenantId, typeof week === "string" ? week : null, reader);
  if (!user?.tenantId || (result.state !== "ready" && result.state !== "empty")) return <CalendarLivePage result={result} />;
  const business = await (user.viewing ? loadBusiness(user.tenantId, "", true) : loadBusiness(user.tenantId, user.name));
  return <CalendarLivePage result={result} free={liveFreeTimes(result, business, new Date())} />;
}

// Thin page. Suspense covers the data.
export default function Page({ searchParams }: { searchParams?: Query } = {}) {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <CalendarData searchParams={searchParams} />
    </Suspense>
  );
}
