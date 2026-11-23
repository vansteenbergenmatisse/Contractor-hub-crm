"use client";

import { useEffect, useRef, type RefObject } from "react";
import { PULL, SLIDE_EASE, isPhone, point, pullDistance, reducedMotion, updatedAgo } from "../api/gestures";
import { useGestures } from "../components/GestureLayer";

export type PullToRefreshOptions = {
  enabled?: boolean;
  // The element that slides down with the pull (the page view in AppShell).
  slide?: RefObject<HTMLElement | null>;
  // The top bar; the spinner sits 6px under its bottom edge while it shows.
  bar?: RefObject<HTMLElement | null>;
  // Runs the real refresh; true means it finished. Without it a pull just springs back.
  onRefresh?: () => Promise<boolean>;
};

// How long a refresh may take before the pull says it could not update, and how long that line stays.
const REFRESH_LIMIT_MS = 10_000;
const FAILED_MS = 2_000;
const FAILED_TEXT = "Could not update. Try again.";

// Touches that start here never pull the page (design `uxPull`): open sheets, a stop's detail, the
// timeline, form fields, and an open Inbox conversation.
const NO_PULL = ".fd-cf:not(.is-off), .fd-cdet.is-on, .fd-tm, input, textarea, .fd-view.is-thru";

// usePullToRefresh(ref, { enabled?, slide?, bar?, onRefresh? }): pull the page down at its top on a phone
// (design logic `uxPull`). `ref` is the scrolling element (`.fd-main`). The page follows at half the
// finger's speed up to 96px with the design's spinner. From 60px letting go shows "Updating" and awaits
// `onRefresh`. "Refreshed" appears only when it resolves true; on false, an error or after 10s the
// line says it could not update. The "Refreshed N min ago" time only ever comes from a real refresh.
export function usePullToRefresh(ref: RefObject<HTMLElement | null>, options: PullToRefreshOptions = {}): void {
  const fx = useGestures();
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const enabled = options.enabled ?? true;

  useEffect(() => {
    const main = ref.current;
    if (!main || !enabled) return;
    let updated: number | null = null;
    let gone = false;
    let busy = false;
    let st: { y: number; x: number; d: number; on: boolean } | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
      timers.add(id);
      return id;
    };

    const slideTo = (d: number, animate: boolean) => {
      const v = latest.current.slide?.current;
      if (!v) return;
      const still = reducedMotion();
      v.style.transition = animate && !still ? `transform ${PULL.slideMs}ms ${SLIDE_EASE}` : "none";
      v.style.transform = d ? `translateY(${d}px)` : "";
      if (!d && animate) later(() => { v.style.transition = ""; }, PULL.slideMs + 40);
    };
    const top = () => {
      const bar = latest.current.bar?.current;
      const r = bar?.getBoundingClientRect();
      return (r && r.height ? r.bottom : 0) + 6;
    };

    const start = (event: TouchEvent) => {
      st = null;
      const p = point(event);
      const target = event.target instanceof Element ? event.target : null;
      if (!p || !target || !isPhone() || busy || fx.isMenuOpen() || event.touches.length !== 1) return;
      if (main.scrollTop > 0 || target.closest(NO_PULL)) return;
      st = { y: p.y, x: p.x, d: 0, on: false };
    };
    const move = (event: TouchEvent) => {
      if (!st) return;
      const p = point(event);
      if (!p) return;
      const dy = p.y - st.y;
      const dx = p.x - st.x;
      if (!st.on) {
        if (dy < PULL.cancelUp || Math.abs(dx) > PULL.cancelX || main.scrollTop > 0) { st = null; return; }
        if (dy < PULL.start || Math.abs(dx) > dy) return;
        st.on = true;
      }
      if (event.cancelable) event.preventDefault();
      const d = pullDistance(dy);
      st.d = d;
      const ready = d >= PULL.ready;
      const text = updated === null ? (ready ? "Release to refresh" : "Pull to refresh") : updatedAgo(updated, Date.now());
      fx.showPull({ phase: ready ? "ready" : "pull", top: top(), progress: Math.min(1, d / PULL.ready), text });
      slideTo(d, false);
    };
    const end = () => {
      const a = st;
      st = null;
      if (!a?.on) return;
      const refresh = latest.current.onRefresh;
      if (a.d < PULL.ready || !refresh) {
        fx.showPull(null);
        slideTo(0, true);
        return;
      }
      busy = true;
      const at = top();
      fx.showPull({ phase: "busy", top: at, progress: 1, text: "Updating" });
      slideTo(PULL.busySlide, true);
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled || gone) return;
        settled = true;
        clearTimeout(limit);
        timers.delete(limit);
        if (ok) updated = Date.now();
        const text = ok ? "Refreshed" : FAILED_TEXT;
        // A failed refresh stops the spinner, so nothing on screen suggests it is still working.
        fx.showPull({ phase: ok ? "busy" : "ready", top: at, progress: 1, text });
        fx.say(text);
        later(() => {
          fx.showPull(null);
          slideTo(0, true);
          busy = false;
        }, ok ? PULL.doneMs : FAILED_MS);
      };
      const limit = later(() => finish(false), REFRESH_LIMIT_MS);
      let run: Promise<boolean>;
      try {
        run = refresh();
      } catch {
        run = Promise.resolve(false);
      }
      run.then((ok) => finish(ok === true), () => finish(false));
    };

    main.addEventListener("touchstart", start, { passive: true });
    main.addEventListener("touchmove", move, { passive: false });
    main.addEventListener("touchend", end, { passive: true });
    main.addEventListener("touchcancel", end, { passive: true });
    return () => {
      gone = true;
      for (const id of timers) clearTimeout(id);
      if (busy || st?.on) fx.showPull(null);
      main.removeEventListener("touchstart", start);
      main.removeEventListener("touchmove", move);
      main.removeEventListener("touchend", end);
      main.removeEventListener("touchcancel", end);
    };
  }, [ref, enabled, fx]);
}
