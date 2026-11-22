"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ROW_PICK_EVENT } from "@/features/app-shell";
import { isVisible, rowFromSearch } from "../api/quotes";
import type { QuoteFilter, QuoteOpen, QuotesState } from "../types";


export type QuoteLinkHandlers = {
  // Search result whose row a filter hides: show every row (design `uxOpen` presses "All").
  showAll: () => void;
  // &open=sheet (Pipeline See quote).
  openSheet: (id: string) => void;
  // &open=price (Pipeline Add price).
  addPrice: (id: string) => void;
};

// Acts once on each link (?row=quote-<id>[&open=...]) and again on every repeat pick of the same
// search result (the shell's ROW_PICK_EVENT). Returns the filter the list renders with: while a fresh
// search link points at a row the filter hides, the list already renders every row, so the row is
// shown in the same commit in which useRowFocus scrolls to it and flashes it (design: show, then flash).
export function useQuoteLink(state: QuotesState, on: QuoteLinkHandlers): QuoteFilter {
  const params = useSearchParams();
  const search = params ? `?${params.toString()}` : typeof window === "undefined" ? "" : window.location.search;
  const link = rowFromSearch(search, state.quotes);
  const [picks, setPicks] = useState(0);
  // The link last acted on. A reducer, so the effect below records it without a cascading setState.
  const [handled, markHandled] = useReducer((_: string | null, next: string | null) => next, null);
  const key = link ? `${link.id}|${link.open ?? ""}|${picks}` : null;
  const fresh = key !== null && key !== handled;
  const linked = link ? state.quotes.find((q) => q.id === link.id) : undefined;
  const reveal = fresh && link?.open !== "sheet" && !!linked && !isVisible(linked, state.filter);

  const current = useRef<{ row: string | null; open: QuoteOpen }>({ row: null, open: null });
  const latest = useRef(on);
  useEffect(() => {
    current.current = { row: link ? `quote-${link.id}` : null, open: link?.open ?? null };
    latest.current = on;
  });

  useEffect(() => {
    const onPick = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail;
      if (typeof id === "string" && id === current.current.row) setPicks((n) => n + 1);
    };
    window.addEventListener(ROW_PICK_EVENT, onPick);
    return () => window.removeEventListener(ROW_PICK_EVENT, onPick);
  }, []);

  useEffect(() => {
    if (!key) {
      markHandled(null);
      return;
    }
    if (!fresh || !link) return;
    markHandled(key);
    if (link.open === "sheet") latest.current.openSheet(link.id);
    else if (link.open === "price") latest.current.addPrice(link.id);
    else if (reveal) latest.current.showAll();
    // Runs once per link; `fresh` and `reveal` are derived from the same key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return reveal ? "all" : state.filter;
}
