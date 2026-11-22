"use client";

import { useSearchParams } from "next/navigation";
import { CalendarPage } from "./CalendarPage";

// The route's entry: reads ?row=<id> (the shell's pushed-row convention) and opens that stop.
// The route wraps it in Suspense because useSearchParams needs one.
export function CalendarPageFromUrl() {
  const row = useSearchParams().get("row");
  return <CalendarPage row={row} />;
}
