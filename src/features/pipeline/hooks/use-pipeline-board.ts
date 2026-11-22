"use client";

import { useCallback, useMemo, useReducer } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/features/app-shell";
import { boardReducer, initialBoard } from "../api/board";
import { sendDocFor, sendTotal } from "../api/send";
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
      const { i, card, primary } = view;
      if (primary.kind === "move") moveTo(i, primary.to);
      else if (primary.kind === "add-price") router.push("/quotes");
      else {
        const kind = primary.kind === "send-quote" ? "Quote" : "Invoice";
        sendTimer({
          kind,
          name: card.name,
          total: sendTotal(card),
          doc: sendDocFor(card, kind),
          // A card moved by a send has no Undo.
          onDone: () => dispatch({ type: "move", i, to: primary.to, bySend: true }),
        });
      }
    },
    [moveTo, router, sendTimer],
  );

  const lose = useCallback(
    (i: number) => {
      askReason({ name: MOCK_CARDS[i].name, onPick: (reason) => dispatch({ type: "lose", i, reason }) });
    },
    [askReason],
  );

  const openCalendar = useCallback(() => router.push("/calendar"), [router]);
  const openQuote = useCallback(() => router.push("/quotes"), [router]);

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
