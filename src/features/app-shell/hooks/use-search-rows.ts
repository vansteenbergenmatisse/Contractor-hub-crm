"use client";

import { useContext, useEffect } from "react";
import { ShellContext } from "../components/ShellContext";
import type { SearchRow } from "../types";

// useSearchRows(page, rows, options?): void
// A page hands the shell the search rows for what it shows now (a moved Pipeline card, a lead added
// by hand, a quote with its new price), so search finds the current state (design: search reads the
// rendered rows). The rows replace the layout's sample rows for that page and stay after the page
// closes (its kept state stays too); a page never opened keeps the layout's rows. Pass rows built
// with useMemo; an equal list is ignored. Outside the shell (a page alone in a test) it does nothing.
// `{ seed: true }`: rows another page already loaded (Today's leads), so search works before the owning
// page is opened. The newest hand-in wins: a changed seed replaces the owning page's older rows, the same
// seed again changes nothing, and an empty seed never clears rows search already has.
export function useSearchRows(page: SearchRow["page"], rows: readonly SearchRow[], options?: { seed?: boolean }): void {
  const shell = useContext(ShellContext);
  const set = shell?.setSearchRows;
  const seed = options?.seed === true;
  useEffect(() => {
    if (seed) set?.(page, rows, { seed: true });
    else set?.(page, rows);
  }, [set, page, rows, seed]);
}
