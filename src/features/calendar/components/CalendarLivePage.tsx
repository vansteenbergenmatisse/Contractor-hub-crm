"use client";

import type { CalendarResult } from "../types";
import { CalendarStatus } from "./CalendarStatus";
import { CalendarWeekBoard } from "./CalendarWeekBoard";

// The real Calendar page. `now` is for tests. A new week is a new board, so nothing stays selected.
export function CalendarLivePage({ result, now }: { result: CalendarResult; now?: Date }) {
  if (result.state === "reconnect" || result.state === "unavailable") return <CalendarStatus state={result.state} />;
  return <CalendarWeekBoard key={result.week.weekStart} result={result} fixedNow={now} />;
}
