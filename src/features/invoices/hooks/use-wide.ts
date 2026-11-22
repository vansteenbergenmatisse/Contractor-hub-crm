"use client";

import { useSyncExternalStore } from "react";

// True on a computer (1024px and up), where the sheet sits beside the list. The server render and the
// first paint assume a computer; the phone value follows right after hydration.
const QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  try {
    const mq = window.matchMedia(QUERY);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  } catch {
    return () => {};
  }
}

const snapshot = () => {
  try { return window.matchMedia(QUERY).matches; } catch { return true; }
};

export function useWide(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
