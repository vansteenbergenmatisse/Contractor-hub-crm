"use client";

import { useContext, useEffect } from "react";
import { ShellContext } from "../components/ShellContext";

// The live Inbox hands the shell its unread count. `partial`: the list was cut off or left rows out, so
// the count is a lower bound. Outside the shell (a page alone in a test) it does nothing.
export function useInboxBadge(count: number, partial = false): void {
  const set = useContext(ShellContext)?.setInboxCount;
  useEffect(() => {
    set?.(count, partial);
  }, [set, count, partial]);
}
