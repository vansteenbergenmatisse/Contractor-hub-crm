"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useGestures, useKeptReducer, useShell, useUndoShortcut } from "@/features/app-shell";
import { useQuotesKept } from "@/features/quotes";
import { boardReducer, canUndo, initialBoard, type BoardAction } from "../api/board";
import { canMoveManually, moveAnnouncement, planStageMove, stageChange } from "../api/stage-move";
import { syncStageMove } from "../api/stage-sync";
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
  const { say } = useGestures();
  // The card whose stage sheet is open.
  const [picking, setPicking] = useState<number | null>(null);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  // Every action that can change a card's stage runs here: the state changes, the one Phase 3 seam
  // hears of it, and a screen reader is told.
  const commit = useCallback(
    (action: BoardAction) => {
      const change = stageChange(latest.current, action);
      dispatch(action);
      if (!change) return;
      syncStageMove(change);
      say(moveAnnouncement(MOCK_CARDS[change.i].name, change.to, change.undone));
    },
    [dispatch, say],
  );
  const router = useRouter();
  // The live Quotes state: a card in Quote to Send asks it whether its quote still needs a price, and
  // Send quote shows that quote (design logic 1142-1158).
  const [{ quotes }] = useQuotesKept();

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
    const card = state.last?.i;
    commit({ type: "undo" });
    // The pressed Undo is gone or hidden now (the note stays drawn, switched off). If focus was left
    // there or nowhere, it goes to the card that came back.
    setTimeout(() => {
      const now = document.activeElement;
      if (now && now !== document.body && !now.closest(".fd-kstub.is-off")) return;
      const row = document.querySelector<HTMLElement>(`[data-row-id="pipeline-${card}"]`);
      (row?.querySelector<HTMLElement>('[aria-haspopup="dialog"]') ?? row?.querySelector<HTMLElement>(".fd-k1"))?.focus();
    }, 0);
  }, [state.last, state.stg, commit]);

  // ⌘Z (Ctrl Z) runs the same Undo as the button, while that button shows. A move made by a send
  // has no Undo, so nothing is registered for it.
  useUndoShortcut(canUndo(state) ? undo : null);

  const show = useCallback(() => {
    if (state.last && !state.last.undo) pick(state.last.to, true);
  }, [state.last, pick]);

  // At the first and the last stage the arrow stays focusable (aria-disabled) and does nothing.
  const prev = useCallback(() => {
    if (state.stg > 0) pick(state.stg - 1);
  }, [pick, state.stg]);
  const next = useCallback(() => {
    if (state.stg < LAST_STAGE) pick(state.stg + 1);
  }, [pick, state.stg]);

  const moveTo = useCallback((i: number, to: number) => commit({ type: "move", i, to }), [commit]);

  const press = useCallback(
    (view: CardView) => {
      const plan = pressPlan(view, quotes);
      if (plan.type === "dispatch") commit(plan.action);
      else if (plan.type === "navigate") router.push(plan.href);
      // A card moved by a send has no Undo: `plan.done` carries bySend.
      else sendTimer({ ...plan.request, onDone: () => commit(plan.done) });
    },
    [router, sendTimer, commit, quotes],
  );

  const lose = useCallback(
    (i: number) => {
      askReason({ name: MOCK_CARDS[i].name, onPick: (reason) => commit({ type: "lose", i, reason }) });
    },
    [askReason, commit],
  );

  const canDrag = useCallback((i: number) => canMoveManually(latest.current.sg[i]), []);
  const canDrop = useCallback((i: number, to: number) => planStageMove(latest.current, i, to).type !== "none", []);

  // A drag dropped card `i` on stage `to`. Lost asks for its reason first.
  const dropOn = useCallback(
    (i: number, to: number) => {
      const plan = planStageMove(latest.current, i, to);
      if (plan.type === "move") commit(plan.action);
      else if (plan.type === "ask-reason") lose(i);
    },
    [commit, lose],
  );

  // The stage sheet's choice. The card may leave the screen, so focus goes to the Undo of the note it
  // leaves behind. The reason sheet opens after this sheet has closed and given focus back.
  const chooseStage = useCallback(
    (to: number) => {
      if (picking === null) return;
      const i = picking;
      const plan = planStageMove(latest.current, i, to);
      setPicking(null);
      if (plan.type === "ask-reason") {
        setTimeout(() => lose(i), 0);
      } else if (plan.type === "move") {
        commit(plan.action);
        setTimeout(() => document.querySelector<HTMLElement>(".fd-kstub:not(.is-off) .fd-sun")?.focus(), 0);
      }
    },
    [picking, commit, lose],
  );
  const closePicker = useCallback(() => setPicking(null), []);

  const openCalendar = useCallback((name: string) => router.push(calendarHref(name)), [router]);
  const openQuote = useCallback((name: string) => router.push(quoteHref(name, "sheet")), [router]);

  return {
    state,
    cards: MOCK_CARDS,
    quotes,
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
    canDrag,
    canDrop,
    dropOn,
    picking,
    openPicker: setPicking,
    chooseStage,
    closePicker,
    openCalendar,
    openQuote,
    isFirst: state.stg === 0,
    isLast: state.stg === LAST_STAGE,
  };
}
