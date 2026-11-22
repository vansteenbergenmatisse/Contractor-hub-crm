"use client";

import { useCallback, useSyncExternalStore } from "react";

// Pages remount below the shell on every navigation, so "closed" lives outside the component.
// Keyed by the layout's render token: random, and it holds no user data.
const closed = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePromptClosed(token: string): [boolean, () => void] {
  const isClosed = useSyncExternalStore(subscribe, () => closed.has(token), () => false);
  const close = useCallback(() => {
    closed.add(token);
    listeners.forEach((listener) => listener());
  }, [token]);
  return [isClosed, close];
}
