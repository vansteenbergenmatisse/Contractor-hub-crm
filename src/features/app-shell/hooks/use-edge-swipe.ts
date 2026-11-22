"use client";

import { useEffect, useRef, type RefObject } from "react";
import { EDGE_PX, EDGE_SWIPE, isPhone, point, snap, suppressClick } from "../api/gestures";
import { useGestures } from "../components/GestureLayer";

export type EdgeSwipeOptions = {
  onSwipe: () => void;
  enabled?: boolean;
  // Asked when a touch starts at the edge; false leaves the touch alone (design: no Back, no edge swipe).
  canStart?: () => boolean;
  // The element that slides along (half the finger, up to 80px) while dragging; the page view in AppShell.
  slide?: RefObject<HTMLElement | null>;
};

// useEdgeSwipe(ref, { onSwipe, enabled?, canStart?, slide? }): a swipe from the left edge on a phone
// (design logic `uxEdge`). The touch must start within 24px of the left edge and `canStart` must allow it; a mostly vertical move gives up; past
// 80px letting go runs `onSwipe` and the click right after is swallowed. The `slide` element follows.
export function useEdgeSwipe(ref: RefObject<HTMLElement | null>, options: EdgeSwipeOptions): void {
  const fx = useGestures();
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const enabled = options.enabled ?? true;

  useEffect(() => {
    const root = ref.current;
    if (!root || !enabled) return;
    let st: { x: number; y: number; dx: number; on: boolean; v: HTMLElement | null } | null = null;
    let restore: ReturnType<typeof setTimeout> | undefined;

    const start = (event: TouchEvent) => {
      st = null;
      const p = point(event);
      if (!p || !isPhone() || event.touches.length !== 1 || fx.isMenuOpen() || p.x > EDGE_PX) return;
      if (latest.current.canStart && !latest.current.canStart()) return;
      st = { x: p.x, y: p.y, dx: 0, on: false, v: latest.current.slide?.current ?? null };
    };
    const move = (event: TouchEvent) => {
      if (!st) return;
      const p = point(event);
      if (!p) return;
      const dx = p.x - st.x;
      const dy = p.y - st.y;
      if (!st.on) {
        if (Math.abs(dy) > EDGE_SWIPE.cancelY && Math.abs(dy) > dx) { st = null; return; }
        if (dx < EDGE_SWIPE.start) return;
        st.on = true;
      }
      if (event.cancelable) event.preventDefault();
      st.dx = dx;
      if (st.v) {
        clearTimeout(restore);
        st.v.style.transition = "none";
        st.v.style.transform = `translateX(${Math.max(0, Math.min(dx, EDGE_SWIPE.maxSlide)) * EDGE_SWIPE.slideRatio}px)`;
      }
    };
    const end = () => {
      const a = st;
      st = null;
      if (!a) return;
      const v = a.v;
      if (v && a.on) {
        v.style.transition = snap(EDGE_SWIPE.snapMs);
        v.style.transform = "";
        restore = setTimeout(() => { v.style.transition = ""; }, EDGE_SWIPE.snapMs + 40);
      }
      if (a.on && a.dx > EDGE_SWIPE.go) {
        latest.current.onSwipe();
        suppressClick(document.body);
      }
    };

    root.addEventListener("touchstart", start, { passive: true });
    root.addEventListener("touchmove", move, { passive: false });
    root.addEventListener("touchend", end, { passive: true });
    root.addEventListener("touchcancel", end, { passive: true });
    return () => {
      clearTimeout(restore);
      root.removeEventListener("touchstart", start);
      root.removeEventListener("touchmove", move);
      root.removeEventListener("touchend", end);
      root.removeEventListener("touchcancel", end);
    };
  }, [ref, enabled, fx]);
}
