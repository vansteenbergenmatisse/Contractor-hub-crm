import { cache } from "react";
import { businessValues } from "@/features/app-shell";
import { hitRateLimit } from "@/features/auth";
import { loadBusiness } from "@/features/brand";
import { calendarTimeZone, loadCalendar } from "@/features/calendar";
import { createTenantCalendarReader, createTenantContactsReader, createTenantLocationZoneReader } from "@/features/highlevel";
import { loadLeads } from "@/features/leads";
import { AppointmentsTile, dayPartWord, LeadsTile, TodayCalendarCard, TodayLeadsCard, TodayPage } from "@/features/today";
import { getRequestUser } from "../session";

export const dynamic = "force-dynamic";

const loadTenantBusiness = cache(async () => {
  const user = await getRequestUser();
  if (!user?.tenantId) return null;
  return user.viewing ? loadBusiness(user.tenantId, "", true) : loadBusiness(user.tenantId, user.name);
});

// One read per request for both lead sections. The tenant comes from the session only.
const loadTenantLeads = cache(async () => {
  const [user, business] = await Promise.all([getRequestUser(), loadTenantBusiness()]);
  const ownEmail = business?.email ?? null;
  const reader = createTenantContactsReader(hitRateLimit, user?.viewing ? { viewerId: user.id, ownEmail } : { ownEmail });
  return loadLeads(user?.tenantId, reader);
});

// One read per request for the greeting and both calendar sections.
const loadTenantCalendar = cache(async () => {
  const user = await getRequestUser();
  const reader = user?.viewing ? createTenantCalendarReader(hitRateLimit, { viewerId: user.id }) : createTenantCalendarReader(hitRateLimit);
  return loadCalendar(user?.tenantId, null, reader);
});

// The location's time zone, one short read per request, so the lead sections never wait on the
// calendar. Null: unknown, and they use the viewer's zone.
const locationZone = cache(async (): Promise<string | null> => {
  try {
    const user = await getRequestUser();
    const read = user?.viewing ? createTenantLocationZoneReader(hitRateLimit, { viewerId: user.id }) : createTenantLocationZoneReader(hitRateLimit);
    return await read(user?.tenantId);
  } catch {
    return null;
  }
});

async function LeadsTileData() {
  const [result, timeZone] = await Promise.all([loadTenantLeads(), locationZone()]);
  return <LeadsTile result={result} timeZone={timeZone} />;
}

async function LeadsCardData() {
  const [result, timeZone] = await Promise.all([loadTenantLeads(), locationZone()]);
  return <TodayLeadsCard result={result} timeZone={timeZone} />;
}

async function AppointmentsTileData() {
  return <AppointmentsTile result={await loadTenantCalendar()} />;
}

async function CalendarCardData() {
  return <TodayCalendarCard result={await loadTenantCalendar()} />;
}

// The client's time of day. "Hello" when the calendar read cannot give its time zone.
async function GreetingWord() {
  const result = await loadTenantCalendar();
  const zone = calendarTimeZone(result);
  return <>{(zone && dayPartWord(new Date(), zone)) || "Hello"}</>;
}

// The layout has already sent signed-out users away; the greeting uses the owner's first name from
// the sub-account's custom values. The user and business lookups are shared with the layout.
// The data sections load inside TodayPage's Suspense boundaries, so the page does not wait for them.
export default async function Page() {
  const business = await loadTenantBusiness();
  const owner = business ? businessValues(business).business_owner_name : "";
  const first = owner.split(/\s+/)[0] || undefined;
  return (
    <TodayPage
      ownerFirst={first}
      greetingWord={<GreetingWord />}
      leadsTile={<LeadsTileData />}
      leadsCard={<LeadsCardData />}
      appointmentsTile={<AppointmentsTileData />}
      calendarCard={<CalendarCardData />}
    />
  );
}
