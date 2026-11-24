import { cache } from "react";
import { businessValues } from "@/features/app-shell";
import { hitRateLimit } from "@/features/auth";
import { loadBusiness } from "@/features/brand";
import { calendarTimeZone, loadCalendar } from "@/features/calendar";
import { createTenantBillingReaders, createTenantCalendarReader, createTenantContactsReader, createTenantEstimatesReader, createTenantLocationZoneReader } from "@/features/highlevel";
import { isInvoicesPageLive, loadInvoices } from "@/features/invoices";
import { loadLeads } from "@/features/leads";
import { isQuotesPageLive, loadQuotes } from "@/features/quotes";
import { isNotifiableCalendar } from "@/features/routes";
import {
  AppointmentsTile, bookedThisWeek, CountTile, dayPartWord, invoicesToSend, jobsThisWeek, LeadsTile, moneyOwed, MoneyCards, quotesOut,
  TodayCalendarCard, TodayLeadsCard, TodayNeedsCard, TodayPage,
} from "@/features/today";
import { getRequestUser } from "../session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

// Null while the page's own server flag is off: the flag is checked before any read.
const loadTenantQuotes = cache(async () => {
  if (!isQuotesPageLive()) return null;
  const user = await getRequestUser();
  const reader = user?.viewing ? createTenantEstimatesReader(hitRateLimit, { viewerId: user.id }) : createTenantEstimatesReader(hitRateLimit);
  return loadQuotes(user?.tenantId, reader);
});

const loadTenantInvoices = cache(async () => {
  if (!isInvoicesPageLive()) return null;
  const user = await getRequestUser();
  const readers = user?.viewing ? createTenantBillingReaders(hitRateLimit, { viewerId: user.id }) : createTenantBillingReaders(hitRateLimit);
  return loadInvoices(user?.tenantId, readers.invoices);
});

async function JobsTileData() {
  const count = jobsThisWeek(await loadTenantCalendar(), isNotifiableCalendar);
  return <CountTile page="pipeline" label="Jobs this week" index={2} count={count} unit="jobs" />;
}

async function InvoicesTileData() {
  return <CountTile page="invoices" label="Invoices to send" index={3} count={invoicesToSend(await loadTenantInvoices())} unit="to send" />;
}

async function NeedsCardData() {
  const [leads, invoices, timeZone] = await Promise.all([loadTenantLeads(), loadTenantInvoices(), locationZone()]);
  return <TodayNeedsCard leads={leads} toSend={invoicesToSend(invoices)} invoicesLive={isInvoicesPageLive()} timeZone={timeZone} />;
}

async function MoneyCardsData() {
  const [calendar, quotes, invoices] = await Promise.all([loadTenantCalendar(), loadTenantQuotes(), loadTenantInvoices()]);
  return <MoneyCards counts={{ booked: bookedThisWeek(calendar), quotes: quotesOut(quotes), owed: moneyOwed(invoices) }} />;
}

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
      jobsTile={<JobsTileData />}
      invoicesTile={<InvoicesTileData />}
      needsCard={<NeedsCardData />}
      moneyCards={<MoneyCardsData />}
    />
  );
}
