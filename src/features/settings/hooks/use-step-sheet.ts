"use client";

import { useEffect, useRef, type RefObject } from "react";

// Search, a row menu and the shortcut list sit above every sheet and take these keys first.
const SHELL_ON_TOP = ".fx-search, .fx-mbox, .fx-help";
const DESKTOP = "(min-width: 1024px)";

// The phone step sheet as a modal: focus moves in, Tab stays in, Escape closes, and focus goes back
// to the opener. Growing the window to desktop closes it, because the rail is then a plain sidebar.
export function useStepSheet(root: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const box = root.current;
    const items = () => Array.from(box?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    items()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      if (document.querySelector(SHELL_ON_TOP)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") { close.current(); return; }
      const list = items();
      if (list.length === 0) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      const step = event.shiftKey ? list.length - 1 : 1;
      list[at < 0 ? (event.shiftKey ? list.length - 1 : 0) : (at + step) % list.length].focus();
    };
    const wide = window.matchMedia?.(DESKTOP);
    const onWide = (event: MediaQueryListEvent) => { if (event.matches) close.current(); };
    window.addEventListener("keydown", onKey, true);
    wide?.addEventListener?.("change", onWide);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      wide?.removeEventListener?.("change", onWide);
      const now = document.activeElement;
      if (!now || now === document.body || box?.contains(now)) opener?.focus();
    };
  }, [open, root]);
}
