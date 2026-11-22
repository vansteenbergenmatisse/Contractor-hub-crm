"use client";

import { Suspense, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PAGE_PATH, useShell, type PageKey } from "@/features/app-shell";
import { Greeting } from "./Greeting";
import { LeadsTile } from "./LeadsTile";
import { MoneyCards } from "./MoneyCards";
import { NotAvailableCard } from "./NotAvailableCard";
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
export function TodayPage({ ownerFirst, leadsTile, leadsCard }: { ownerFirst?: string; leadsTile?: ReactNode; leadsCard?: ReactNode }) {
  const router = useRouter();
  // The shell's details follow a Settings edit; the server's name is only the fallback.
  const first = useShell().business?.first ?? ownerFirst;
  return (
    <>
      <Greeting first={first} />
      <Tiles
        first={<Suspense fallback={<LeadsTile result={null} />}>{leadsTile ?? <LeadsTile result={{ state: "unavailable" }} />}</Suspense>}
        tiles={NOT_WIRED}
        onOpen={(page: PageKey) => router.push(PAGE_PATH[page])}
      />
      <NotAvailableCard id="fd-need-h" title="Needs you" index={5} className="fd-need" />
      <div className="fd-two">
        <NotAvailableCard id="fd-cal-h" title="Today’s calendar" index={6} />
        <Suspense fallback={<TodayLeadsCard result={null} />}>{leadsCard ?? <TodayLeadsCard result={{ state: "unavailable" }} />}</Suspense>
      </div>
      <MoneyCards />
    </>
  );
}
