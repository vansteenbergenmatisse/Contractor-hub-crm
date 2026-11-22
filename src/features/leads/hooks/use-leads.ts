"use client";

import { useEffect, useReducer, type Dispatch } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createInitialState, leadsReducer } from "../api/leads-logic";
import { MOCK_LEADS } from "../mock";
import type { LeadsAction, LeadsState } from "../types";

// Local screen state only. No fetch, no timer.
export function useLeads(): [LeadsState, Dispatch<LeadsAction>] {
  return useReducer(leadsReducer, MOCK_LEADS, createInitialState);
}

// The shell's New lead button links to /leads?add=1. Open the Add a lead sheet for it, then drop the
// parameter so the button opens the sheet again next time.
export function useOpenAddFromUrl(dispatch: Dispatch<LeadsAction>) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wanted = params.get("add") === "1";
  useEffect(() => {
    if (!wanted) return;
    dispatch({ type: "openAdd" });
    router.replace(pathname);
  }, [wanted, dispatch, router, pathname]);
}
