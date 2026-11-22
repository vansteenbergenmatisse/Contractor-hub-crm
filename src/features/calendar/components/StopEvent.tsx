"use client";

import type { PointerEvent } from "react";
import { Icon, useRowGestures } from "@/features/app-shell";
import { stopRowActions, type StopRowHandlers } from "../api/row-actions";
import type { EventView } from "../api/view";
import { Glyph } from "./Glyph";

// One stop in the grid, with its long-press, right-click and menu-key menu.
export function StopEvent({ event: e, onPointerDown, onClick, ...handlers }: StopRowHandlers & {
  event: EventView;
  onPointerDown: (ev: PointerEvent<HTMLButtonElement>) => void;
  onClick: () => void;
}) {
  const gestures = useRowGestures<HTMLButtonElement>({ label: e.name, actions: stopRowActions(e.cls.includes("is-past"), handlers), swipe: false });
  return (
    <button
      {...gestures}
      type="button"
      className={e.cls}
      aria-pressed={e.selected}
      data-row-id={e.id}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      <span className="fd-et1">{e.start} · {e.kind === "J" ? "Job" : "Estimate"}</span>
      <span className="fd-et2"><b>{e.start}</b>{e.added ? null : <i>to {e.end}</i>}</span>
      {e.added ? null : <span className="fd-ekt"><span className={`fd-kind ${e.kind === "J" ? "is-job" : "is-estimate"}`}>{e.kind === "J" ? "Job" : "Estimate"}</span></span>}
      <span className="fd-enm">{e.name}</span>
      <span className="fd-esv">{e.added ? "Added by you" : e.service}</span>
      {e.added ? null : <span className="fd-ead"><Glyph name="pin" size={14} />{e.address}</span>}
      {e.added ? null : <span className="fd-ech" aria-hidden="true"><Icon name="right" size={18} strokeWidth={2.2} /></span>}
    </button>
  );
}
