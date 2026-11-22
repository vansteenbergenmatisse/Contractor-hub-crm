"use client";

import { useMemo, useSyncExternalStore } from "react";

// Nothing to listen to: the money cards read the clock once per render, rounded to the minute so React
// sees a stable value.
const subscribe = () => () => {};
const snapshot = () => Math.floor(Date.now() / 60_000) * 60_000;
const serverSnapshot = () => null;

// "Now" for dates the page draws. `fixed` (tests) wins. On the server and while hydrating this is null:
// the server's time zone is not the visitor's, so server HTML and the browser's first render agree and
// the dates appear right after hydration (the calendar's `useNow` pattern).
export function useClientNow(fixed?: Date): Date | null {
  const tick = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return useMemo(() => fixed ?? (tick === null ? null : new Date(tick)), [fixed, tick]);
}
