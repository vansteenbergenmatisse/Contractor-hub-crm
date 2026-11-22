"use client";

import { useSyncExternalStore } from "react";

// Phone layout: one column up to 1023px (the shell's breakpoint). The server and the first client
// render say "computer" (false), then the real width takes over, so nothing mismatches.
const QUERY = "(max-width: 1023px)";

function subscribe(onChange: () => void): () => void {
  try {
    const mq = window.matchMedia(QUERY);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  } catch {
    return () => {};
  }
}

// Read at call time, for a button press.
export function isPhoneNow(): boolean {
  try { return window.matchMedia(QUERY).matches; } catch { return false; }
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, isPhoneNow, () => false);
}
