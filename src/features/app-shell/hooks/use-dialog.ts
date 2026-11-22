"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createFocusReturn, trapFocus } from "../api/focus";

// What every shell sheet does while it is open (build prompt section 13, "Sheets trap focus and
// close on Esc"): Escape runs `onEscape`, Tab stays inside `root`, and on close focus goes back to
// the element that had it when the sheet opened. Focus is only given back when it was lost (on the
// page body or still inside the sheet), so a page that moved focus on purpose keeps it.
// Both keys are caught before the page sees them, so a page's own Escape does not also run.
// `yieldTo` (optional) is asked on every key: while it returns true another sheet sits on top (the menu
// drawer behind a page's stop sheet), so this one leaves Escape and Tab alone for that sheet to handle.
export type DialogOptions = { yieldTo?: () => boolean };

export function useDialog(root: RefObject<HTMLElement | null>, onEscape: () => void, active = true, options: DialogOptions = {}): void {
  const escape = useRef(onEscape);
  const yieldTo = useRef(options.yieldTo);
  useEffect(() => {
    escape.current = onEscape;
    yieldTo.current = options.yieldTo;
  });
  const [back] = useState(createFocusReturn);
  useEffect(() => {
    if (!active) return;
    back.remember(document.activeElement);
    const box = root.current;
    const onKey = (event: KeyboardEvent) => {
      if ((event.key === "Escape" || event.key === "Tab") && yieldTo.current?.()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        escape.current();
      } else if (event.key === "Tab" && trapFocus(event, root.current)) {
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      const now = document.activeElement;
      if (!now || now === document.body || (box?.isConnected && box.contains(now))) back.restore();
      else back.forget();
    };
  }, [active, back, root]);
}
