import { Suspense } from "react";
import { hitRateLimit } from "@/features/auth";
import { CalendarLivePage, CalendarSkeleton, loadCalendar } from "@/features/calendar";
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
  return <CalendarLivePage result={result} />;
}

// Thin page. Suspense covers the data.
export default function Page({ searchParams }: { searchParams?: Query } = {}) {
  return (
    <Suspense fallback={<CalendarSkeleton />}>
      <CalendarData searchParams={searchParams} />
    </Suspense>
  );
}
