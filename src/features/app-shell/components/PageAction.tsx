"use client";

import { useEffect, useId, type ReactNode } from "react";
import { useShell } from "./ShellContext";

// A page puts its action bar content above the tab bar by rendering this. Phone only (CSS hides it
// from 1024px). The node is re-registered when it changes. `hidden` keeps the content mounted (its
// buttons stay in the page, so focus can go back to them) but hides it, and the bar too when nothing
// else shows in it (design `fd-hid`).
export function PageAction({ children, hidden = false }: { children: ReactNode; hidden?: boolean }) {
  const { setAction } = useShell();
  const id = useId();
  useEffect(() => {
    setAction(id, children, hidden);
  });
  useEffect(() => () => setAction(id, null), [id, setAction]);
  return null;
}
