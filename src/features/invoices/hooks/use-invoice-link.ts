"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ROW_PICK_EVENT } from "@/features/app-shell";
import { matchesFilter } from "../api/invoices";
import type { Filter, InvoicesKeptState } from "../types";


// Acts once on each search link (?row=invoice-<no>) and again on every repeat pick of the same result
// (ROW_PICK_EVENT). While a fresh link points at a row the filter hides, the list renders every row, so
// the row is already shown in the commit in which useRowFocus scrolls to it and flashes it (design
// `uxOpen`: show the row, then flash it); `showAll` then makes "All" stick. Returns the filter to render.
export function useInvoiceLink(state: InvoicesKeptState, showAll: () => void): Filter {
  const params = useSearchParams();
  const row = params ? params.get("row") : typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("row");
  const linked = state.invoices.find((i) => `invoice-${i.no}` === row);
  const [picks, setPicks] = useState(0);
  // The link last acted on. A reducer, so the effect below records it without a cascading setState.
  const [handled, markHandled] = useReducer((_: string | null, next: string | null) => next, null);
  const key = linked ? `${linked.no}|${picks}` : null;
  const fresh = key !== null && key !== handled;
  const reveal = fresh && !!linked && !matchesFilter(state.filter, linked.st);

  const current = useRef<string | null>(null);
  const latest = useRef(showAll);
  useEffect(() => {
    current.current = linked ? `invoice-${linked.no}` : null;
    latest.current = showAll;
  });

  useEffect(() => {
    const onPick = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail;
      if (typeof id === "string" && id === current.current) setPicks((n) => n + 1);
    };
    window.addEventListener(ROW_PICK_EVENT, onPick);
    return () => window.removeEventListener(ROW_PICK_EVENT, onPick);
  }, []);

  useEffect(() => {
    if (!key) {
      markHandled(null);
      return;
    }
    if (!fresh) return;
    markHandled(key);
    if (reveal) latest.current();
    // Runs once per link; `fresh` and `reveal` are derived from the same key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return reveal ? "all" : state.filter;
}
