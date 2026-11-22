"use client";

import { useKeptReducer } from "@/features/app-shell";
import type { LeadsResult } from "@/features/leads";
import { createReducer, initialState } from "../api/state";
import { useTimeZone } from "../hooks/use-time-zone";
import type { Todo } from "../types";
import { LeadsCard } from "./LeadsCard";

const NO_TODOS: readonly Todo[] = [];
const reducer = createReducer(NO_TODOS);

// The card with its range, kept while the owner moves between pages.
export function TodayLeadsCard({ result }: { result: LeadsResult | null }) {
  const [state, dispatch] = useKeptReducer("today", reducer, NO_TODOS, initialState);
  const timeZone = useTimeZone();
  return <LeadsCard result={result} range={state.range} onRange={(range) => dispatch({ type: "range", range })} timeZone={timeZone} />;
}
