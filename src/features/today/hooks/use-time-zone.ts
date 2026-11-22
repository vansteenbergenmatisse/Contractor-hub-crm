"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const serverZone = () => "UTC";

// The viewer's time zone. The server renders in UTC; after hydration the labels use the browser's.
export function useTimeZone(): string {
  return useSyncExternalStore(noSubscribe, browserZone, serverZone);
}
