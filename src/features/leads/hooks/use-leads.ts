"use client";

import { useEffect, useRef, type Dispatch } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useKeptReducer } from "@/features/app-shell";
import { createInitialState, leadsReducer } from "../api/leads-logic";
import { MOCK_LEADS } from "../mock";
import type { LeadsAction, LeadsState } from "../types";

// Screen state only, kept under "leads" while the shell is mounted, so a call or a booking stays
// when the owner goes to another page and comes back. No fetch, no timer.
export function useLeads(): [LeadsState, Dispatch<LeadsAction>] {
  return useKeptReducer("leads", leadsReducer, MOCK_LEADS, createInitialState);
}

// `?row=<lead id>` from the search: when the filter hides that lead, show all leads again (as the
// design does), on open and whenever `?row=` changes while the page is open.
export function useRevealLead(shownIds: readonly string[], dispatch: Dispatch<LeadsAction>) {
  const row = useSearchParams().get("row");
  const shown = useRef(shownIds);
  useEffect(() => {
    shown.current = shownIds;
  });
  useEffect(() => {
    if (!row || shown.current.includes(row) || !MOCK_LEADS.some((l) => l.id === row)) return;
    dispatch({ type: "filter", filter: "all" });
  }, [row, dispatch]);
}

// The shell's New lead button links to /leads?add=1. Run "Add a lead" for it (the sheet on a phone,
// the side form on a computer), then drop the parameter so the button works again next time.
export function useOpenAddFromUrl(onAdd: () => void) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wanted = params.get("add") === "1";
  // Latest callback, router and path in refs: the effect runs only when `?add=1` appears, also with
  // Leads already open (the ⌘⌥N shortcut), and never again for a new router object or callback.
  const latest = useRef({ onAdd, router, pathname });
  useEffect(() => {
    latest.current = { onAdd, router, pathname };
  });
  useEffect(() => {
    if (!wanted) return;
    const { onAdd: add, router: r, pathname: path } = latest.current;
    add();
    r.replace(path);
  }, [wanted]);
}
