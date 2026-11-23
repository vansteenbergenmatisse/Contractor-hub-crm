"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { EDGE_PX, LONG_PRESS, ROW_SWIPE, findBack, isPhone, point, rowSwipeFrame, rowSwipeIntent, snap, suppressClick, swipeActions, swipeText, type RowAction } from "../api/gestures";
import { useGestures } from "../components/GestureLayer";

export type RowGestureOptions = {
  // The row's name, for the menu's label "Actions for <label>".
  label: string;
  // What the row can do: the menu lists them all; the one marked swipe "right" / "left" runs on a full swipe.
  actions: readonly RowAction[];
  disabled?: boolean;
  // false: the row has the menu but no swipe, and a sideways drag stays a native pan (design: calendar stops).
  swipe?: boolean;
};

export type RowGestureBindings<T extends HTMLElement> = {
  ref: (element: T | null) => void;
  onContextMenu: (event: MouseEvent<T>) => void;
  onKeyDown: (event: KeyboardEvent<T>) => void;
};

const typing = (target: EventTarget | null) => target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable='true']");

// useRowGestures(options): spread the result on a row (design logic `uxSwipe` + `uxCtx`).
// - Touch, swipe right: the row follows the finger over the design's colour strip; past min(120px, 40% of
//   the row) letting go runs the action marked `swipe: "right"` and says "<label>. Done.". Swipe left runs
//   `swipe: "left"`. A side with no action only gives 28px. A vertical move stays a scroll.
// - Touch, hold 500ms without moving 8px: opens the phone menu with the row lifted above it.
// - Right-click: opens the menu at the pointer. The ContextMenu key or Shift+F10 (on the row or a button in
//   it) opens it from the keyboard, first item focused, so keyboard and screen-reader users reach every action.
// - The click right after a swipe or a long press does not also press the row.
// Needs a GestureLayer above it (AppShell has one). The row's own buttons stay; this only adds ways in.
export function useRowGestures<T extends HTMLElement = HTMLElement>(options: RowGestureOptions): RowGestureBindings<T> {
  const fx = useGestures();
  const [element, setElement] = useState<T | null>(null);
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  const openMenu = (row: HTMLElement, x: number, y: number, touch: boolean, keyboard: boolean) => {
    const o = latest.current;
    if (o.disabled || !o.actions.length) return;
    fx.openMenu({ anchor: row, x, y, touch, keyboard, label: o.label, actions: o.actions });
  };
  const open = useRef(openMenu);
  useLayoutEffect(() => {
    open.current = openMenu;
  });

  useEffect(() => {
    const row = element;
    if (!row) return;
    type Swipe = { x: number; y: number; on: boolean; right: RowAction | null; left: RowAction | null; go: boolean; act: RowAction | null };
    let st: Swipe | null = null;
    let lp: { x: number; y: number; fired: boolean } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let restore: ReturnType<typeof setTimeout> | undefined;

    const start = (event: TouchEvent) => {
      st = null;
      lp = null;
      const p = point(event);
      if (!p || event.touches.length !== 1 || latest.current.disabled || fx.isMenuOpen()) return;
      lp = { x: p.x, y: p.y, fired: false };
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!lp) return;
        lp.fired = true;
        open.current(row, lp.x, lp.y, true, false);
      }, LONG_PRESS.ms);
      if (latest.current.swipe === false) return;
      // on a phone the left edge belongs to the edge swipe, only while the page shows a Back (design `uxSwipe`)
      if (p.x <= EDGE_PX && isPhone() && findBack(row.closest("[data-pg]"))) return;
      st = { x: p.x, y: p.y, on: false, right: null, left: null, go: false, act: null };
    };

    const move = (event: TouchEvent) => {
      const p = point(event);
      if (!p) return;
      if (lp && !lp.fired && (Math.abs(p.x - lp.x) > LONG_PRESS.slop || Math.abs(p.y - lp.y) > LONG_PRESS.slop)) {
        clearTimeout(timer);
        lp = null;
      }
      if (!st) return;
      const dx = p.x - st.x;
      const dy = p.y - st.y;
      if (!st.on) {
        const intent = rowSwipeIntent(dx, dy);
        if (intent === "cancel") { st = null; return; }
        if (intent === "wait") return;
        const sides = swipeActions(latest.current.actions);
        st.right = sides.right;
        st.left = sides.left;
        st.on = true;
        clearTimeout(timer);
        lp = null;
      }
      if (event.cancelable) event.preventDefault();
      const act = dx > 0 ? st.right : st.left;
      const width = row.getBoundingClientRect().width;
      const frame = rowSwipeFrame(dx, width, !!act);
      clearTimeout(restore);
      row.style.transition = "none";
      row.style.transform = `translateX(${frame.offset}px)`;
      st.act = act;
      st.go = frame.go;
      const r = row.getBoundingClientRect();
      const d = frame.offset;
      fx.showSwipe({
        side: d > 0 ? "r" : "l",
        go: frame.go,
        none: !act,
        label: act ? swipeText(act) : "",
        top: r.top,
        height: r.height,
        left: d > 0 ? r.left - d : r.right,
        width: Math.abs(d),
      });
    };

    const end = (event: TouchEvent) => {
      clearTimeout(timer);
      if (lp?.fired) {
        if (event.cancelable) event.preventDefault();
        suppressClick(row);
      }
      lp = null;
      const a = st;
      st = null;
      if (!a?.on) return;
      row.style.transition = snap(ROW_SWIPE.snapMs);
      row.style.transform = "";
      fx.showSwipe(null);
      restore = setTimeout(() => { row.style.transition = ""; }, ROW_SWIPE.snapMs + 40);
      if (a.go && a.act) {
        a.act.onAction();
        fx.say(`${swipeText(a.act)}. Done.`);
      }
      suppressClick(row);
    };

    row.addEventListener("touchstart", start, { passive: true });
    row.addEventListener("touchmove", move, { passive: false });
    row.addEventListener("touchend", end, { passive: false });
    row.addEventListener("touchcancel", end, { passive: false });
    return () => {
      clearTimeout(timer);
      clearTimeout(restore);
      row.removeEventListener("touchstart", start);
      row.removeEventListener("touchmove", move);
      row.removeEventListener("touchend", end);
      row.removeEventListener("touchcancel", end);
    };
  }, [element, fx]);

  return {
    ref: setElement,
    onContextMenu: (event) => {
      const o = latest.current;
      if (o.disabled) return;
      // a row with no actions still has no browser menu; it just opens none (design `uxCtx`, `uxMenu`)
      event.preventDefault();
      if (!o.actions.length) return;
      // a long press already opened it (touch devices also send contextmenu)
      if (fx.isMenuOpen() && Date.now() - fx.menuOpenedAt() < LONG_PRESS.reopenGuardMs) return;
      const keyboard = !event.clientX && !event.clientY;
      openMenu(event.currentTarget, event.clientX, event.clientY, false, keyboard);
    },
    onKeyDown: (event) => {
      if (event.defaultPrevented || typing(event.target)) return;
      if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
      const o = latest.current;
      if (o.disabled || !o.actions.length) return;
      event.preventDefault();
      openMenu(event.currentTarget, 0, 0, false, true);
    },
  };
}
