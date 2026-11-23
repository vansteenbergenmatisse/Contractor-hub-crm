"use client";

import { useContext, useEffect } from "react";
import { ShellContext } from "../components/ShellContext";

// The live Inbox hands the shell its unread count. Outside the shell (a page alone in a test) it does nothing.
export function useInboxBadge(count: number): void {
  const set = useContext(ShellContext)?.setInboxCount;
  useEffect(() => {
    set?.(count);
  }, [set, count]);
}
