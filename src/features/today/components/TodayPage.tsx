"use client";

import { Suspense, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PAGE_PATH, useShell, type PageKey } from "@/features/app-shell";
import { AppointmentsTile } from "./AppointmentsTile";
import { CountTile } from "./CountTile";
import { Greeting } from "./Greeting";
import { LeadsTile } from "./LeadsTile";
import { MoneyCards } from "./MoneyCards";
import { NotAvailableCard } from "./NotAvailableCard";
import { TodayCalendarCard } from "./TodayCalendarCard";
import { TodayLeadsCard } from "./TodayLeadsCard";
import { TodayNeedsLoading } from "./TodayNeedsCard";
import { Tiles, type PageTile } from "./Tiles";

const NOT_WIRED: readonly PageTile[] = [
  { page: "calendar", label: "Appointments", value: null, sub: "", aria: "Appointments: not available yet. Open the calendar" },
  { page: "pipeline", label: "Jobs this week", value: null, sub: "", aria: "Jobs this week: not available yet. Open the job stages in the pipeline" },
  { page: "invoices", label: "Invoices to send", value: null, sub: "", aria: "Invoices to send: not available yet. Open Invoices" },
];

// The page content only. The shell adds the `fd-view` wrapper, the top bar and the tab bar.
// `leadsTile` and `leadsCard` are the server's slots for the tenant's real leads. Every other section
// has no real source yet and says so. With no slot, the lead sections show the unavailable state.
// `greetingWord`, `appointmentsTile` and `calendarCard` are the server's slots for the real calendar.
// `jobsTile`, `invoicesTile`, `needsCard` and `moneyCards` are the slots for the counts from real reads.
export function TodayPage({ ownerFirst, leadsTile, leadsCard, greetingWord, appointmentsTile, calendarCard, jobsTile, invoicesTile, needsCard, moneyCards }: {
  ownerFirst?: string;
  leadsTile?: ReactNode;
  leadsCard?: ReactNode;
  greetingWord?: ReactNode;
  appointmentsTile?: ReactNode;
  calendarCard?: ReactNode;
  jobsTile?: ReactNode;
  invoicesTile?: ReactNode;
  needsCard?: ReactNode;
  moneyCards?: ReactNode;
}) {
  const router = useRouter();
  // The shell's details follow a Settings edit; the server's name is only the fallback.
  const first = useShell().business?.first ?? ownerFirst;
  const calendar = calendarCard
    ? <Suspense fallback={<TodayCalendarCard result={null} />}>{calendarCard}</Suspense>
    : <NotAvailableCard id="fd-cal-h" title="Today’s calendar" index={6} />;
  // The design order needs a real Needs you card: Needs you, then the calendar before leads.
  return (
    <>
      <Greeting first={first} word={greetingWord ? <Suspense fallback="Hello">{greetingWord}</Suspense> : undefined} />
      <Tiles
        first={<Suspense fallback={<LeadsTile result={null} />}>{leadsTile ?? <LeadsTile result={{ state: "unavailable" }} />}</Suspense>}
        second={appointmentsTile ? <Suspense fallback={<AppointmentsTile result={null} />}>{appointmentsTile}</Suspense> : undefined}
        tiles={appointmentsTile ? NOT_WIRED.slice(1) : NOT_WIRED}
        live={{
          pipeline: jobsTile ? <Suspense fallback={<CountTile page="pipeline" label="Jobs this week" index={2} count={null} unit="jobs" busy />}>{jobsTile}</Suspense> : undefined,
          invoices: invoicesTile ? <Suspense fallback={<CountTile page="invoices" label="Invoices to send" index={3} count={null} unit="to send" busy />}>{invoicesTile}</Suspense> : undefined,
        }}
        onOpen={(page: PageKey) => router.push(PAGE_PATH[page])}
      />
      {needsCard ? <Suspense fallback={<TodayNeedsLoading />}>{needsCard}</Suspense> : null}
      <div className="fd-two">
        {needsCard ? calendar : null}
        <Suspense fallback={<TodayLeadsCard result={null} index={needsCard ? 7 : 5} />}>{leadsCard ?? <TodayLeadsCard result={{ state: "unavailable" }} index={needsCard ? 7 : 5} />}</Suspense>
        {needsCard ? null : calendar}
      </div>
      {needsCard ? null : <NotAvailableCard id="fd-need-h" title="Needs you" index={7} className="fd-need" />}
      {moneyCards ? <Suspense fallback={<MoneyCards busy />}>{moneyCards}</Suspense> : <MoneyCards />}
    </>
  );
}
