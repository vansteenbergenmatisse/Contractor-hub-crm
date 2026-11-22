"use client";

import { useEffect, useRef, type RefObject } from "react";
import { EDGE_PX, horizontalSwipe, isPhone, point, suppressClick } from "../api/gestures";
import { useGestures } from "../components/GestureLayer";

export type HorizontalSwipeOptions = {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  enabled?: boolean;
};

// useHorizontalSwipe(ref, { onSwipeLeft?, onSwipeRight?, enabled? }): a sideways flick on a phone (design
// logic `uxSwipe2`: swipe the stage list to change stage, the day strip to change week). Counted when the
// finger lifts at least 70px sideways and at most 40px up or down. Swipe left = next (the stage after,
// the week after), right = previous. Touches that start within 24px of the left edge belong to the edge swipe.
export function useHorizontalSwipe(ref: RefObject<HTMLElement | null>, options: HorizontalSwipeOptions): void {
  const fx = useGestures();
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const enabled = options.enabled ?? true;

  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    let st: { x: number; y: number } | null = null;
    const start = (event: TouchEvent) => {
      st = null;
      const p = point(event);
      if (!p || !isPhone() || event.touches.length !== 1 || fx.isMenuOpen() || p.x <= EDGE_PX) return;
      st = p;
    };
    const end = (event: TouchEvent) => {
      const a = st;
      st = null;
      const p = point(event, true);
      if (!a || !p) return;
      const way = horizontalSwipe(p.x - a.x, p.y - a.y);
      const run = way === "left" ? latest.current.onSwipeLeft : way === "right" ? latest.current.onSwipeRight : undefined;
      if (!run) return;
      run();
      suppressClick(document.body);
    };
    const cancel = () => { st = null; };
    root.addEventListener("touchstart", start, { passive: true });
    root.addEventListener("touchend", end, { passive: true });
    root.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      root.removeEventListener("touchstart", start);
      root.removeEventListener("touchend", end);
      root.removeEventListener("touchcancel", cancel);
    };
  }, [ref, enabled, fx]);
}
