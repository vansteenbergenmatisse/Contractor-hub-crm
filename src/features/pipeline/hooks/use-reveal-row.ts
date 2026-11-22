"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { cardIndexOfRow } from "../api/links";

// A search result opens /pipeline?row=pipeline-N. Open the stage card N sits in now (as the design
// presses that stage's button), on mount and whenever `?row=` changes while the page is open.
// The shell's useRowFocus then scrolls to the card and flashes it.
export function useRevealRow(stages: readonly number[], pick: (stage: number, open: boolean) => void): void {
  const row = useSearchParams().get("row");
  const latest = useRef({ stages, pick });
  useEffect(() => {
    latest.current = { stages, pick };
  });
  useEffect(() => {
    const i = cardIndexOfRow(row, latest.current.stages.length);
    if (i < 0) return;
    latest.current.pick(latest.current.stages[i], true);
  }, [row]);
}
