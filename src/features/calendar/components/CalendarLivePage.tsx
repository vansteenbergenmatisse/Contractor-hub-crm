"use client";

import type { CalendarResult, LiveFreeTimes } from "../types";
import { CalendarStatus } from "./CalendarStatus";
import { CalendarWeekBoard } from "./CalendarWeekBoard";

// The real Calendar page. `now` is for tests. A new week is a new board, so nothing stays selected.
// `free` is worked out on the server from the client's hours; without it no free time is offered.
export function CalendarLivePage({ result, now, free }: { result: CalendarResult; now?: Date; free?: LiveFreeTimes }) {
  if (result.state === "reconnect" || result.state === "unavailable") return <CalendarStatus state={result.state} />;
  return <CalendarWeekBoard key={result.week.weekStart} result={result} fixedNow={now} free={free} />;
}
