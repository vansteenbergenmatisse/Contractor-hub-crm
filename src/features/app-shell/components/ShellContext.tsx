"use client";

import { createContext, useContext, useEffect, useId, type ReactNode } from "react";
import type { Business, ReasonRequest, SearchRow, SendTimerRequest } from "../types";
import type { BusinessPatch } from "../api/business";
import { businessValues } from "../api/business";

// What the shell offers to a page: the action bar above the tab bar, "this screen is a pushed
// detail" (no tab bar), and the two shared pop-ups (send timer, reason sheet).
export type ShellApi = {
  // The signed-in tenant's business details, from its custom values.
  business: Business;
  setAction: (id: string, node: ReactNode | null, hidden?: boolean) => void;
  setPushed: (id: string, pushed: boolean) => void;
  sendTimer: (request: SendTimerRequest) => void;
  askReason: (request: ReasonRequest) => void;
  openSearch: () => void;
  openFeedback: () => void;
  // Count of conversations that need a reply, for the Inbox badge. Mock until Phase 3.
  setInboxCount: (n: number) => void;
  // Puts edited business details on screen for this browser session (Settings). "" or null blanks
  // a field; derived fields (initials, tag, site) follow. Nothing is saved or sent.
  updateBusiness: (patch: BusinessPatch) => void;
  // Ends the session, then loads /sign-in in full (the menu card's Sign out; Settings' Sign out).
  signOut: () => Promise<void>;
  // A page's current search rows (see useSearchRows); they replace the layout's rows for that page.
  // With `{ seed: true }` they fill in for that page, and a changed seed replaces its older rows.
  setSearchRows: (page: SearchRow["page"], rows: readonly SearchRow[], options?: { seed?: boolean }) => void;
};

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const api = useContext(ShellContext);
  if (!api) throw new Error("useShell must be used inside AppShell.");
  return api;
}

// A page marks itself a pushed detail screen (a conversation, a quote, an invoice, the automation
// editor, a settings section): the tab bar and the action bar step aside.
export function usePushed(pushed: boolean) {
  const { setPushed } = useShell();
  const id = useId();
  useEffect(() => {
    setPushed(id, pushed);
    return () => setPushed(id, false);
  }, [id, pushed, setPushed]);
}

// The business details of the signed-in tenant.
export function useBusiness(): Business {
  return useShell().business;
}

// The details under the custom-value key names (empty strings when missing), for sample texts.
export function useBusinessValues() {
  return businessValues(useShell().business);
}
