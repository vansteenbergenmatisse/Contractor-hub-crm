"use client";

import { useMemo } from "react";
import { useKeptReducer, useSearchRows, type SearchRow } from "@/features/app-shell";
import { leadSearchRows, withReceived, type LeadsResult } from "@/features/leads";
import { createReducer, initialState } from "../api/state";
import { useTimeZone } from "../hooks/use-time-zone";
import type { Todo } from "../types";
import { LeadsCard } from "./LeadsCard";

const NO_TODOS: readonly Todo[] = [];
const reducer = createReducer(NO_TODOS);
const NO_ROWS: readonly SearchRow[] = [];

// The card with its range, kept while the owner moves between pages.
export function TodayLeadsCard({ result, timeZone: locationZone }: { result: LeadsResult | null; timeZone?: string | null }) {
  const [state, dispatch] = useKeptReducer("today", reducer, NO_TODOS, initialState);
  const viewerZone = useTimeZone();
  const timeZone = locationZone ?? viewerZone;
  // The leads Today already loaded, so search finds them before Leads has been opened.
  const rows = useMemo(
    () => (result?.state === "ready" ? leadSearchRows(withReceived(result.leads, result.loadedAt, timeZone)) : NO_ROWS),
    [result, timeZone],
  );
  useSearchRows("leads", rows, { seed: true });
  return <LeadsCard result={result} range={state.range} onRange={(range) => dispatch({ type: "range", range })} timeZone={timeZone} />;
}
