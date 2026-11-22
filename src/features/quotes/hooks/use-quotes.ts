"use client";

import { useReducer } from "react";
import { initialState, quotesReducer } from "../api/quotes";
import { SEED_QUOTES } from "../mock";

// Local state only. The quotes are mock data (Phase 2); nothing is fetched or stored.
export function useQuotes() {
  return useReducer(quotesReducer, SEED_QUOTES, initialState);
}
