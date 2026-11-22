"use client";

import { useSyncExternalStore } from "react";

const subscribe = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};

// The window's inner width, kept up to date. On the server (and in the first hydration pass) it is
// `serverWidth`, null by default, so nothing guesses a size it cannot know.
export function useWindowWidth(serverWidth: number | null = null): number | null {
  return useSyncExternalStore(subscribe, () => window.innerWidth, () => serverWidth);
}
