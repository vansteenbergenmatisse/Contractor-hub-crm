"use client";

import { useMemo, useSyncExternalStore } from "react";

const subscribe = (notify: () => void) => {
  const id = setInterval(notify, 60_000);
  return () => clearInterval(id);
};
// A number, rounded to the minute, so React sees a stable value between ticks.
const snapshot = () => Math.floor(Date.now() / 60_000) * 60_000;

// The clock for the page. `fixed` (tests) wins. On the server and during hydration this is null:
// the server's time zone is not the visitor's, so the page draws its dates only on the client.
export function useNow(fixed?: Date): Date | null {
  const tick = useSyncExternalStore(subscribe, snapshot, () => null);
  return useMemo(() => fixed ?? (tick === null ? null : new Date(tick)), [fixed, tick]);
}
