"use client";

import { useEffect, useRef, type Dispatch } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ROW_PICK_EVENT, useKeptReducer } from "@/features/app-shell";
import { createInitialState, leadsReducer } from "../api/leads-logic";
import { MOCK_LEADS } from "../mock";
import type { LeadsAction, LeadsState } from "../types";

// Screen state only, kept under "leads" while the shell is mounted, so a call or a booking stays
// when the owner goes to another page and comes back. No fetch, no timer.
export function useLeads(): [LeadsState, Dispatch<LeadsAction>] {
  return useKeptReducer("leads", leadsReducer, MOCK_LEADS, createInitialState);
}

// `?row=<lead id>` from the search: when the filter hides that lead, show all leads again (as the
// design does), on open, whenever `?row=` changes while the page is open, and on every pick of a
// result (the shell's ROW_PICK_EVENT), also the same result picked again after the owner changed the
// filter (design logic `uxOpen` acts on every pick). A lead already shown keeps the filter.
// `knownIds`: every lead of this page, the hand-added ones included.
export function useRevealLead(shownIds: readonly string[], knownIds: readonly string[], dispatch: Dispatch<LeadsAction>) {
  const row = useSearchParams().get("row");
  const latest = useRef({ shownIds, knownIds, dispatch });
  useEffect(() => {
    latest.current = { shownIds, knownIds, dispatch };
  });
  const reveal = useRef((id: string | null) => {
    const { shownIds: shown, knownIds: known, dispatch: send } = latest.current;
    if (!id || shown.includes(id) || !known.includes(id)) return;
    send({ type: "filter", filter: "all" });
  });
  useEffect(() => {
    reveal.current(row);
  }, [row]);
  useEffect(() => {
    const onPick = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail;
      if (typeof id === "string") reveal.current(id);
    };
    window.addEventListener(ROW_PICK_EVENT, onPick);
    return () => window.removeEventListener(ROW_PICK_EVENT, onPick);
  }, []);
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
