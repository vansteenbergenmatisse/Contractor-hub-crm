"use client";

import { useEffect, useRef, type RefObject } from "react";
import { SHEET_SWIPE, clearSheetStyle, isPhone, point } from "../api/gestures";

export type SheetSwipeOptions = {
  enabled?: boolean;
  // Listen on `ref` as a container and drag the sheet `target.closest(selector)` inside it, instead of `ref` itself.
  selector?: string;
};

// A touch already taken by a sheet closer to the finger, so a container listening for the same sheets
// (AppShell) does not handle it twice.
const claimed = new WeakSet<Event>();

// useSheetSwipe(ref, onClose, options?): a bottom sheet on a phone closes with a swipe down, like Cancel
// (design logic `uxSheets`). Phone only (under 1024px wide).
// - The drag starts in the top 44px (the grabber), or anywhere while the sheet is scrolled to its top.
// - Down: the sheet follows the finger; letting go past 90px runs `onClose(sheet)`, else it springs back.
// - Up from the grabber: the sheet grows with the finger (up to 92% of the screen); past 60px it stays at 92vh.
// `onClose` gets the dragged sheet element; the hook clears the inline drag styles after it.
export function useSheetSwipe(ref: RefObject<HTMLElement | null>, onClose: (sheet: HTMLElement) => void, options: SheetSwipeOptions = {}): void {
  const { enabled = true, selector } = options;
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    let st: { sh: HTMLElement; y: number; h: number; dy: number; on: boolean; top: boolean } | null = null;

    const start = (event: TouchEvent) => {
      st = null;
      if (claimed.has(event) || !isPhone() || event.touches.length !== 1) return;
      const target = event.target instanceof Element ? event.target : null;
      const sh = selector ? (target?.closest<HTMLElement>(selector) ?? null) : root;
      if (!sh || !root.contains(sh)) return;
      const p = point(event);
      if (!p) return;
      const r = sh.getBoundingClientRect();
      const top = p.y - r.top <= SHEET_SWIPE.grabZone;
      if (!top && sh.scrollTop > 0) return;
      claimed.add(event);
      st = { sh, y: p.y, h: r.height, dy: 0, on: false, top };
    };

    const move = (event: TouchEvent) => {
      if (!st) return;
      const p = point(event);
      if (!p) return;
      claimed.add(event);
      const dy = p.y - st.y;
      if (!st.on) {
        if (Math.abs(dy) < SHEET_SWIPE.start) return;
        if (dy < 0 && !st.top) { st = null; return; }
        st.on = true;
      }
      if (event.cancelable) event.preventDefault();
      st.dy = dy;
      const sh = st.sh;
      sh.style.transition = "none";
      if (dy > 0) sh.style.transform = `translateY(${dy}px)`;
      else {
        const h = `${Math.min(window.innerHeight * SHEET_SWIPE.maxShare, st.h - dy)}px`;
        sh.style.maxHeight = h;
        sh.style.height = h;
        sh.style.transform = "";
      }
    };

    const end = (event: TouchEvent) => {
      const a = st;
      st = null;
      if (!a?.on) return;
      claimed.add(event);
      const sh = a.sh;
      sh.style.transition = "";
      if (a.dy > SHEET_SWIPE.close) {
        close.current(sh);
        clearSheetStyle(sh);
      } else if (a.dy < SHEET_SWIPE.grow) {
        sh.style.maxHeight = "92vh";
        sh.style.height = "92vh";
        sh.style.transform = "";
      } else {
        sh.style.transform = "";
        if (!sh.classList.contains("fx-lg")) {
          sh.style.maxHeight = "";
          sh.style.height = "";
        }
      }
    };

    root.addEventListener("touchstart", start, { passive: true });
    root.addEventListener("touchmove", move, { passive: false });
    root.addEventListener("touchend", end, { passive: true });
    root.addEventListener("touchcancel", end, { passive: true });
    return () => {
      root.removeEventListener("touchstart", start);
      root.removeEventListener("touchmove", move);
      root.removeEventListener("touchend", end);
      root.removeEventListener("touchcancel", end);
    };
  }, [ref, enabled, selector]);
}
