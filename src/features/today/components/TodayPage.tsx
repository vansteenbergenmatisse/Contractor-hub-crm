"use client";

import { useRouter } from "next/navigation";
import { PAGE_PATH, PageAction, type PageKey } from "@/features/app-shell";
import { nextLabel, nextStop, nextTodo, numClass, openCount } from "../api/selectors";
import { useToday } from "../hooks/useToday";
import { INVOICES_TILE, JOBS_TILE, LEADS, MOCK_OWNER_FIRST, STOPS, TODOS } from "../mock";
import { CalendarCard } from "./CalendarCard";
import { Greeting } from "./Greeting";
import { LeadsCard } from "./LeadsCard";
import { MoneyCards } from "./MoneyCards";
import { NeedsCard } from "./NeedsCard";
import { Tiles, type TileView } from "./Tiles";

// The page content only. The shell adds the `fd-view` wrapper, the top bar and the tab bar.
// Phase 2: mock data, state on screen only.
export function TodayPage({ ownerFirst = MOCK_OWNER_FIRST }: { ownerFirst?: string }) {
  const router = useRouter();
  const today = useToday(TODOS);
  const { state } = today;
  const next = nextTodo(state, TODOS);
  const stop = nextStop(STOPS);
  const leadsToday = LEADS.filter((l) => l.ago).length;

  const tiles: TileView[] = [
    { page: "leads", label: "New leads", value: leadsToday, unit: "today", sub: `${LEADS.length} this week`, aria: `New leads: ${leadsToday} today, ${LEADS.length} this week. Open leads` },
    { page: "calendar", label: "Appointments", value: STOPS.length, unit: "today", sub: stop ? `Next at ${stop.time}` : "None left today", aria: `Appointments: ${STOPS.length} today${stop ? `, next at ${stop.time}` : ""}. Open the calendar` },
    { page: "pipeline", label: "Jobs this week", value: JOBS_TILE.value, sub: `${JOBS_TILE.today} today`, aria: `Jobs this week: ${JOBS_TILE.value}, ${JOBS_TILE.today} today. Open the job stages in the pipeline` },
    { page: "invoices", label: "Invoices to send", value: INVOICES_TILE.value, sub: `${INVOICES_TILE.ready} is ready now`, aria: `Invoices to send: ${INVOICES_TILE.value}. Open Invoices` },
  ];

  return (
    <>
      <Greeting first={ownerFirst} left={openCount(state, TODOS)} numClass={numClass(state)} />
      <Tiles tiles={tiles} onOpen={(page: PageKey) => router.push(PAGE_PATH[page])} />
      <NeedsCard todos={TODOS} state={state} onFilter={today.setFilter} onPress={today.press} onUndo={today.undo} />
      <div className="fd-two">
        <CalendarCard stops={STOPS} state={state} />
        <LeadsCard range={state.range} onRange={today.setRange} />
      </div>
      <MoneyCards />
      {next ? (
        <PageAction>
          <button type="button" className="fd-btn fx-accb" onClick={today.pressNext}>{nextLabel(next)}</button>
        </PageAction>
      ) : null}
    </>
  );
}
