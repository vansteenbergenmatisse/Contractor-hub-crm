"use client";

import { useCallback, useMemo, useReducer } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/features/app-shell";
import { boardReducer, initialBoard } from "../api/board";
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
  const [state, dispatch] = useReducer(boardReducer, MOCK_CARDS, initialBoard);
  const { sendTimer, askReason } = useShell();
  const router = useRouter();

  const counts = useMemo(() => stageCounts(state, MOCK_HIDDEN_COUNTS), [state]);
  const groups = useMemo(() => groupCounts(counts), [counts]);

  const pick = useCallback((k: number, open?: boolean) => {
    scrollToTop();
    dispatch({ type: "pick", k, open });
  }, []);

  const toList = useCallback(() => {
    scrollToTop();
    dispatch({ type: "list" });
  }, []);

  const undo = useCallback(() => {
    if (state.last && state.stg !== state.last.from) scrollToTop();
    dispatch({ type: "undo" });
  }, [state.last, state.stg]);

  const show = useCallback(() => {
    if (state.last && !state.last.undo) pick(state.last.to, true);
  }, [state.last, pick]);

  const prev = useCallback(() => pick(state.stg - 1), [pick, state.stg]);
  const next = useCallback(() => pick(state.stg + 1), [pick, state.stg]);

  const moveTo = useCallback((i: number, to: number) => dispatch({ type: "move", i, to }), []);

  const press = useCallback(
    (view: CardView) => {
      const plan = pressPlan(view);
      if (plan.type === "dispatch") dispatch(plan.action);
      else if (plan.type === "navigate") router.push(plan.href);
      // A card moved by a send has no Undo: `plan.done` carries bySend.
      else sendTimer({ ...plan.request, onDone: () => dispatch(plan.done) });
    },
    [router, sendTimer],
  );

  const lose = useCallback(
    (i: number) => {
      askReason({ name: MOCK_CARDS[i].name, onPick: (reason) => dispatch({ type: "lose", i, reason }) });
    },
    [askReason],
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
