"use client";

import { useEffect, useReducer, useRef, type Dispatch } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createInitialState, leadsReducer } from "../api/leads-logic";
import { MOCK_LEADS } from "../mock";
import type { LeadsAction, LeadsState } from "../types";

// Local screen state only. No fetch, no timer.
export function useLeads(): [LeadsState, Dispatch<LeadsAction>] {
  return useReducer(leadsReducer, MOCK_LEADS, createInitialState);
}

// The shell's New lead button links to /leads?add=1. Run "Add a lead" for it (the sheet on a phone,
// the side form on a computer), then drop the parameter so the button works again next time.
export function useOpenAddFromUrl(onAdd: () => void) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wanted = params.get("add") === "1";
  const add = useRef(onAdd);
  useEffect(() => {
    add.current = onAdd;
  });
  useEffect(() => {
    if (!wanted) return;
    add.current();
    router.replace(pathname);
  }, [wanted, router, pathname]);
}
