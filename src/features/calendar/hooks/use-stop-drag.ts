"use client";

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { dayAtX, dropStart } from "../api/grid";

const MIN_WIDTH = 1024;
const THRESHOLD = 8;

// Drag a stop to another day or time in the computer week grid (like Google Calendar). Plain
// pointer events. Nothing leaves the page: a drop only changes the page state, with Undo.
export function useStopDrag(opts: { gridRef: RefObject<HTMLElement | null>; enabled: boolean; onDrop: (id: string, day: number, start: number) => void }) {
  const { gridRef, enabled, onDrop } = opts;
  const suppress = useRef(false);
  // Ends a drag that is under way: removes the document listeners and puts the stop back.
  const stop = useRef<(() => void) | null>(null);
  // The page closes mid-drag: nothing may stay attached to the document, and nothing is dropped.
  useEffect(() => () => stop.current?.(), []);

  // The click that follows a drag must not open the stop.
  const consumeClick = useCallback(() => {
    if (!suppress.current) return false;
    suppress.current = false;
    return true;
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, id: string, len: number) => {
    if (!enabled || event.button !== 0 || window.innerWidth < MIN_WIDTH) return;
    const el = event.currentTarget;
    const x0 = event.clientX;
    const y0 = event.clientY;
    let moved = false;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (!moved && Math.abs(dx) + Math.abs(dy) < THRESHOLD) return;
      moved = true;
      el.style.transform = `translate(${dx}px,${dy}px)`;
      el.style.zIndex = "5";
      el.style.opacity = ".85";
    };
    const end = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      el.style.transform = "";
      el.style.zIndex = "";
      el.style.opacity = "";
      stop.current = null;
    };
    const up = (e: PointerEvent) => {
      const box = el.getBoundingClientRect();
      end();
      const grid = gridRef.current;
      if (!moved || !grid) return;
      suppress.current = true;
      setTimeout(() => { suppress.current = false; }, 50);
      const rect = grid.getBoundingClientRect();
      const style = getComputedStyle(grid);
      const cols = style.gridTemplateColumns.split(" ").map(parseFloat);
      const rowH = parseFloat(style.gridTemplateRows) || 26;
      const day = dayAtX(e.clientX, rect.left, cols);
      if (day < 0) return;
      onDrop(id, day, dropStart(box.top, rect.top, rowH, len));
    };
    stop.current?.();
    stop.current = end;
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }, [enabled, gridRef, onDrop]);

  return { onPointerDown, consumeClick };
}
