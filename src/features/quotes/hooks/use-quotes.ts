"use client";

import { useKeptReducer } from "@/features/app-shell";
import { initialState, quotesReducer } from "../api/quotes";
import { SEED_QUOTES } from "../mock";

// Local state only. The quotes are mock data (Phase 2); nothing is fetched or stored. The state is kept
// while the signed-in shell is mounted, so a quote built or sent stays that way across pages.
export function useQuotes() {
  return useKeptReducer("quotes", quotesReducer, SEED_QUOTES, initialState);
}
