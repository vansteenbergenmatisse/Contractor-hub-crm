"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 1024px)";
const media = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null);
const subscribe = (notify: () => void) => {
  const list = media();
  list?.addEventListener("change", notify);
  return () => list?.removeEventListener("change", notify);
};

// True when the CSS draws the computer week grid.
export function useDesktopGrid(): boolean {
  return useSyncExternalStore(subscribe, () => media()?.matches ?? false, () => false);
}
