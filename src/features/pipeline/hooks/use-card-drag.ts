"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { cardIndexOfRow } from "../api/links";
import { groupAtPoint, stageAtPoint } from "../api/stage-move";
import { GROUPS, groupOf } from "../api/stages";

const COMPUTER_WIDTH = 1024;
const START_PX = 8;
const CLICK_GUARD_MS = 50;
const GROUP_HOVER_MS = 500;

export type CardDragOptions = {
  // The stage in view when a drag starts; Escape brings it back.
  stage: number;
  canDrag: (i: number) => boolean;
  canDrop: (i: number, to: number) => boolean;
  onDrop: (i: number, to: number) => void;
  // Show this stage (and so its group).
  onView: (stage: number) => void;
};

function columnsOf(grid: HTMLElement) {
  return Array.from(grid.querySelectorAll<HTMLElement>(".fd-kh")).map((h) => {
    const r = h.getBoundingClientRect();
    return { stage: Number(/\bis-s(\d+)/.exec(h.className)?.[1] ?? -1), left: r.left, right: r.right };
  });
}

function stageUnder(grid: HTMLElement, x: number, y: number): number {
  const r = grid.getBoundingClientRect();
  return y < r.top || y > r.bottom ? -1 : stageAtPoint(x, columnsOf(grid));
}

function groupUnder(grid: HTMLElement, x: number, y: number): number {
  const tabs = Array.from(grid.closest(".fd-kb")?.querySelectorAll<HTMLElement>(".fd-sgb") ?? []);
  return groupAtPoint(x, y, tabs.map((t) => t.getBoundingClientRect()));
}

// A copy of the card that follows the pointer. The card itself is hidden when its group is not in view.
function makeGhost(el: HTMLElement): HTMLElement {
  const r = el.getBoundingClientRect();
  const ghost = el.cloneNode(true) as HTMLElement;
  [ghost, ...Array.from(ghost.querySelectorAll("[id]"))].forEach((x) => x.removeAttribute("id"));
  ghost.removeAttribute("data-row-id");
  ghost.removeAttribute("aria-label");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  ghost.setAttribute("data-drag-ghost", "");
  ghost.className = "fd-kc";
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    margin: "0",
    zIndex: "70",
    opacity: ".85",
    pointerEvents: "none",
    transition: "none",
    animation: "none",
  });
  (document.querySelector(".fd-app") ?? document.body).appendChild(ghost);
  return ghost;
}

// The click a browser fires when the mouse is let go must not press what is under it.
function swallowNextClick() {
  const stop = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
    window.removeEventListener("click", stop, true);
  };
  window.addEventListener("click", stop, true);
  setTimeout(() => window.removeEventListener("click", stop, true), CLICK_GUARD_MS);
}

// Drag a card to a column with the mouse, on the computer board (the same gesture as the design's
// calendar stops: 8px to start, the card follows the pointer). Holding over a group tab for 500ms
// opens that group, so every allowed stage can be reached. Escape cancels and brings the first group
// back. Only a mouse drags: on a touch screen a finger keeps scrolling, the long-press menu and the
// stage swipe, and the stage sheet moves the card. Returns the allowed stage under the pointer, or -1.
export function useCardDrag(grid: RefObject<HTMLElement | null>, count: number, options: CardDragOptions): number {
  const [over, setOver] = useState(-1);
  const opts = useRef(options);
  useEffect(() => {
    opts.current = options;
  });

  useEffect(() => {
    const root = grid.current;
    if (!root) return;
    let stopDrag: (() => void) | null = null;

    const down = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || event.ctrlKey || window.innerWidth < COMPUTER_WIDTH) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest("button, a, input, select, textarea, label")) return;
      const el = target.closest<HTMLElement>(".fd-kc");
      const i = cardIndexOfRow(el?.getAttribute("data-row-id") ?? null, count);
      if (!el || i < 0 || !opts.current.canDrag(i)) return;
      stopDrag?.();
      const { clientX: x0, clientY: y0, pointerId: id } = event;
      const startStage = opts.current.stage;
      let ghost: HTMLElement | null = null;
      let cancelled = false;
      let switched = false;
      let hover = -1;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const reset = () => {
        clearTimeout(timer);
        ghost?.remove();
        el.style.opacity = "";
        document.body.style.userSelect = "";
        setOver(-1);
      };
      const restore = () => {
        if (switched) opts.current.onView(startStage);
        switched = false;
      };
      const stop = () => {
        clearTimeout(timer);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("keydown", key, true);
        stopDrag = null;
      };
      const move = (e: PointerEvent) => {
        if (e.pointerId !== id || cancelled) return;
        const dx = e.clientX - x0;
        const dy = e.clientY - y0;
        if (!ghost && Math.abs(dx) + Math.abs(dy) < START_PX) return;
        if (!ghost) {
          ghost = makeGhost(el);
          el.style.opacity = ".4";
          document.body.style.userSelect = "none";
        }
        ghost.style.transform = `translate(${dx}px, ${dy}px)`;
        const stage = stageUnder(root, e.clientX, e.clientY);
        setOver(stage >= 0 && opts.current.canDrop(i, stage) ? stage : -1);
        const g = groupUnder(root, e.clientX, e.clientY);
        if (g === hover) return;
        hover = g;
        clearTimeout(timer);
        if (g < 0 || g === groupOf(opts.current.stage)) return;
        timer = setTimeout(() => {
          switched = true;
          setOver(-1);
          opts.current.onView(GROUPS[g].first);
        }, GROUP_HOVER_MS);
      };
      const up = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        stop();
        if (!ghost) return;
        swallowNextClick();
        if (cancelled) return;
        const to = stageUnder(root, e.clientX, e.clientY);
        reset();
        if (to >= 0 && opts.current.canDrop(i, to)) opts.current.onDrop(i, to);
        else restore();
      };
      const cancel = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        stop();
        if (ghost) reset();
        restore();
      };
      const key = (e: KeyboardEvent) => {
        if (e.key !== "Escape" || !ghost || cancelled) return;
        e.preventDefault();
        e.stopPropagation();
        cancelled = true;
        reset();
        restore();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("keydown", key, true);
      stopDrag = () => {
        stop();
        if (ghost) reset();
      };
    };

    root.addEventListener("pointerdown", down);
    return () => {
      root.removeEventListener("pointerdown", down);
      stopDrag?.();
    };
  }, [grid, count]);

  return over;
}
