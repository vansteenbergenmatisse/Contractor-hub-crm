"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useKeptReducer, useShell, useUndoShortcut } from "@/features/app-shell";
import { boardReducer, canUndo, initialBoard } from "../api/board";
import { calendarHref, quoteHref } from "../api/links";
import { pressPlan } from "../api/press";
import { LAST_STAGE } from "../api/stages";
import { MOCK_CARDS, MOCK_HIDDEN_COUNTS } from "../mock";
import { groupCounts, stageCounts } from "../api/view";
import type { CardView } from "../types";

// A new stage starts at its top (the phone scrolls inside the page).
function scrollToTop() {
  const main = document.querySelector(".fd-main");
  if (main && main.scrollTop) main.scrollTop = 0;
}

// The board's state and what each button does. Every action only changes state on screen.
// Nothing here calls the network, the database or the CRM, and nothing sends a text.
export function usePipelineBoard() {
  // Kept under "pipeline" while the shell is mounted, so a moved card stays moved when the owner
  // goes to another page and comes back (mock state only, nothing is saved).
  const [state, dispatch] = useKeptReducer("pipeline", boardReducer, MOCK_CARDS, initialBoard);
  const { sendTimer, askReason } = useShell();
  const router = useRouter();

  const counts = useMemo(() => stageCounts(state, MOCK_HIDDEN_COUNTS), [state]);
  const groups = useMemo(() => groupCounts(counts), [counts]);

  const pick = useCallback((k: number, open?: boolean) => {
    scrollToTop();
    dispatch({ type: "pick", k, open });
  }, [dispatch]);

  const toList = useCallback(() => {
    scrollToTop();
    dispatch({ type: "list" });
  }, [dispatch]);

  const undo = useCallback(() => {
    if (state.last && state.stg !== state.last.from) scrollToTop();
    dispatch({ type: "undo" });
  }, [state.last, state.stg, dispatch]);

  // ⌘Z (Ctrl Z) runs the same Undo as the button, while that button shows. A move made by a send
  // has no Undo, so nothing is registered for it.
  useUndoShortcut(canUndo(state) ? undo : null);

  const show = useCallback(() => {
    if (state.last && !state.last.undo) pick(state.last.to, true);
  }, [state.last, pick]);

  const prev = useCallback(() => pick(state.stg - 1), [pick, state.stg]);
  const next = useCallback(() => pick(state.stg + 1), [pick, state.stg]);

  const moveTo = useCallback((i: number, to: number) => dispatch({ type: "move", i, to }), [dispatch]);

  const press = useCallback(
    (view: CardView) => {
      const plan = pressPlan(view);
      if (plan.type === "dispatch") dispatch(plan.action);
      else if (plan.type === "navigate") router.push(plan.href);
      // A card moved by a send has no Undo: `plan.done` carries bySend.
      else sendTimer({ ...plan.request, onDone: () => dispatch(plan.done) });
    },
    [router, sendTimer, dispatch],
  );

  const lose = useCallback(
    (i: number) => {
      askReason({ name: MOCK_CARDS[i].name, onPick: (reason) => dispatch({ type: "lose", i, reason }) });
    },
    [askReason, dispatch],
  );

  const openCalendar = useCallback((name: string) => router.push(calendarHref(name)), [router]);
  const openQuote = useCallback((name: string) => router.push(quoteHref(name)), [router]);

  return {
    state,
    cards: MOCK_CARDS,
    counts,
    groups,
    pick,
    toList,
    undo,
    show,
    prev,
    next,
    moveTo,
    press,
    lose,
    openCalendar,
    openQuote,
    isFirst: state.stg === 0,
    isLast: state.stg === LAST_STAGE,
  };
}
