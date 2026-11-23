"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ROW_PICK_EVENT } from "@/features/app-shell";
import { stageOfRow } from "../api/live-board";
import type { LiveColumn } from "../types";

function scrollToTop() {
  const main = document.querySelector(".fd-main");
  if (main && main.scrollTop) main.scrollTop = 0;
}

// Which stage is in view, and on a phone whether one stage is open. View state only: nothing here
// changes a deal. A search result (?row=) opens the stage its card is in.
export function useLiveBoard(columns: readonly LiveColumn[]) {
  const [picked, setView] = useState({ stage: 0, open: false });
  const row = useSearchParams().get("row");
  const latest = useRef(columns);
  useEffect(() => {
    latest.current = columns;
  });
  const reveal = useRef((id: string | null) => {
    const stage = stageOfRow(latest.current, id);
    if (stage >= 0) setView({ stage, open: true });
  });
  useEffect(() => {
    reveal.current(row);
  }, [row]);
  useEffect(() => {
    const onPick = (event: Event) => {
      const id = (event as CustomEvent<unknown>).detail;
      if (typeof id === "string") reveal.current(id);
    };
    window.addEventListener(ROW_PICK_EVENT, onPick);
    return () => window.removeEventListener(ROW_PICK_EVENT, onPick);
  }, []);

  const last = columns.length - 1;
  // A refresh can return fewer stages than the one in view.
  const view = { ...picked, stage: Math.max(0, Math.min(picked.stage, last)) };
  const pick = useCallback((stage: number, open?: boolean) => {
    scrollToTop();
    setView((now) => ({ stage, open: open ?? now.open }));
  }, []);
  const toList = useCallback(() => {
    scrollToTop();
    setView((now) => ({ ...now, open: false }));
  }, []);
  const prev = useCallback(() => {
    if (view.stage > 0) pick(view.stage - 1);
  }, [pick, view.stage]);
  const next = useCallback(() => {
    if (view.stage < last) pick(view.stage + 1);
  }, [last, pick, view.stage]);
  return { ...view, pick, toList, prev, next, isFirst: view.stage === 0, isLast: view.stage === last };
}
