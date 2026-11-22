"use client";

import { useKeptReducer } from "@/features/app-shell";
import { initialState, quotesReducer } from "../api/quotes";
import { SEED_QUOTES } from "../mock";
import type { QuotesAction, QuotesState } from "../types";

// The page-state key of the quotes. Pipeline and Today read the same state through useQuotesKept.
export const QUOTES_KEY = "quotes";

// Local state only. The quotes are mock data (Phase 2); nothing is fetched or stored. The state is kept
// while the signed-in shell is mounted, so a quote built or sent stays that way across pages.
export function useQuotes(): [QuotesState, (action: QuotesAction) => void] {
  return useKeptReducer(QUOTES_KEY, quotesReducer, SEED_QUOTES, initialState);
}

// The live Quotes state for other pages (design: Pipeline's "Quote to Send" and Today read P.quotes).
// Same key, reducer and seed as the Quotes page, so both see one state; a dispatch from another page
// runs the Quotes reducer (for example "sent" when a send started on Pipeline finishes).
export const useQuotesKept = useQuotes;
