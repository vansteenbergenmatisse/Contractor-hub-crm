"use client";

import { Suspense, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PAGE_PATH, useShell, type PageKey } from "@/features/app-shell";
import { AppointmentsTile } from "./AppointmentsTile";
import { Greeting } from "./Greeting";
import { LeadsTile } from "./LeadsTile";
import { MoneyCards } from "./MoneyCards";
import { NotAvailableCard } from "./NotAvailableCard";
import { TodayCalendarCard } from "./TodayCalendarCard";
import { TodayLeadsCard } from "./TodayLeadsCard";
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
export function TodayPage({ ownerFirst, leadsTile, leadsCard, greetingWord, appointmentsTile, calendarCard }: {
  ownerFirst?: string;
  leadsTile?: ReactNode;
  leadsCard?: ReactNode;
  greetingWord?: ReactNode;
  appointmentsTile?: ReactNode;
  calendarCard?: ReactNode;
}) {
  const router = useRouter();
  // The shell's details follow a Settings edit; the server's name is only the fallback.
  const first = useShell().business?.first ?? ownerFirst;
  return (
    <>
      <Greeting first={first} word={greetingWord ? <Suspense fallback="Hello">{greetingWord}</Suspense> : undefined} />
      <Tiles
        first={<Suspense fallback={<LeadsTile result={null} />}>{leadsTile ?? <LeadsTile result={{ state: "unavailable" }} />}</Suspense>}
        second={appointmentsTile ? <Suspense fallback={<AppointmentsTile result={null} />}>{appointmentsTile}</Suspense> : undefined}
        tiles={appointmentsTile ? NOT_WIRED.slice(1) : NOT_WIRED}
        onOpen={(page: PageKey) => router.push(PAGE_PATH[page])}
      />
      {/* Leads come first because they are the only real records here. When Needs you has real data,
          restore the design order: Needs you, then .fd-two with the calendar before leads. */}
      <div className="fd-two">
        <Suspense fallback={<TodayLeadsCard result={null} />}>{leadsCard ?? <TodayLeadsCard result={{ state: "unavailable" }} />}</Suspense>
        {calendarCard
          ? <Suspense fallback={<TodayCalendarCard result={null} />}>{calendarCard}</Suspense>
          : <NotAvailableCard id="fd-cal-h" title="Today’s calendar" index={6} />}
      </div>
      <NotAvailableCard id="fd-need-h" title="Needs you" index={7} className="fd-need" />
      <MoneyCards />
    </>
  );
}
