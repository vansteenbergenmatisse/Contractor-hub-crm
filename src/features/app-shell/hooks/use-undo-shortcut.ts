"use client";

import { createContext, useContext, useEffect, useRef } from "react";

// Where pages register what ⌘Z (Ctrl Z) undoes. The newest registration wins.
export type UndoRegistry = { add: (run: () => void) => () => void; top: () => (() => void) | null };

export function createUndoRegistry(): UndoRegistry {
  const stack: Array<() => void> = [];
  return {
    add(run) {
      stack.push(run);
      return () => {
        const at = stack.lastIndexOf(run);
        if (at >= 0) stack.splice(at, 1);
      };
    },
    top: () => stack[stack.length - 1] ?? null,
  };
}

export const UndoContext = createContext<UndoRegistry | null>(null);

// useUndoShortcut(undo: (() => void) | null): void
// Pass the function that the page's on-screen Undo runs while that Undo is shown, and null when it
// is not. ⌘Z / Ctrl Z (not while typing in a field) then calls it. Without a registration the shell
// presses the visible button whose label starts with "Undo" in the current page, like the design.
// Outside the shell (a page rendered alone in a test) it does nothing.
export function useUndoShortcut(undo: (() => void) | null): void {
  const registry = useContext(UndoContext);
  const latest = useRef(undo);
  useEffect(() => {
    latest.current = undo;
  });
  const on = undo !== null;
  useEffect(() => {
    if (!registry || !on) return;
    return registry.add(() => latest.current?.());
  }, [registry, on]);
}
