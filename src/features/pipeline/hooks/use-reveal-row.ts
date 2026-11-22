"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ROW_PICK_EVENT } from "@/features/app-shell";
import { cardIndexOfRow } from "../api/links";

type Board = { sg: readonly number[]; stg: number; open: boolean };

// A search result opens /pipeline?row=pipeline-N. Open the stage card N sits in now (as the design
// presses that stage's button), on mount, whenever `?row=` changes while the page is open, and on
// every pick of a result (the shell's ROW_PICK_EVENT), also the same result picked again after the
// owner went to another stage (design logic `uxOpen` acts on every pick). A stage already open is
// left alone. The shell's useRowFocus then scrolls to the card and flashes it.
export function useRevealRow(board: Board, pick: (stage: number, open: boolean) => void): void {
  const row = useSearchParams().get("row");
  const latest = useRef({ board, pick });
  useEffect(() => {
    latest.current = { board, pick };
  });
  const reveal = useRef((id: string | null) => {
    const { board: s, pick: go } = latest.current;
    const i = cardIndexOfRow(id, s.sg.length);
    if (i < 0) return;
    const st = s.sg[i];
    if (s.stg === st && s.open) return;
    go(st, true);
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
}
