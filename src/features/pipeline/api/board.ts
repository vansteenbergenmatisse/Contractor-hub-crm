import { CHECK_BACK_LATER, LAST_STAGE, LOST, groupOf } from "./stages";
import type { BoardState, LostReason, MockCard } from "../types";

// Pure state changes of the board. A move only changes the stage of a card on screen. In Phase 3
// it will change the opportunity stage in the CRM; the CRM's workflows do the follow-up. This app
// sends nothing.

export function initialBoard(cards: readonly MockCard[]): BoardState {
  return {
    sg: cards.map((c) => c.stage),
    seq: cards.map(() => 0),
    n: 0,
    stg: 0,
    open: false,
    last: null,
    bumps: 0,
    sw: 0,
    gch: false,
    ev: "",
    rs: {},
    noUndoAt: -1,
  };
}

// Look at stage `k`. On a phone `open` says whether one stage is open (true) or the list (false).
export function pickStage(s: BoardState, k: number, open?: boolean): BoardState {
  const o = open === undefined ? s.open : open;
  if (k < 0 || k > LAST_STAGE || (k === s.stg && o === s.open)) return s;
  return { ...s, stg: k, open: o, sw: s.sw + 1, gch: groupOf(k) !== groupOf(s.stg), ev: "stg" };
}

export function backToList(s: BoardState): BoardState {
  return { ...s, open: false, sw: s.sw + 1, gch: false, ev: "stg" };
}

// Move card `i` to stage `to`. `bySend` marks a move made by Send quote or Invoice: it has no Undo.
export function moveCard(s: BoardState, i: number, to: number, bySend = false): BoardState {
  const from = s.sg[i];
  if (from === undefined || from === to) return s;
  const sg = s.sg.slice();
  const seq = s.seq.slice();
  sg[i] = to;
  seq[i] = s.n + 1;
  return {
    ...s,
    sg,
    seq,
    n: s.n + 1,
    last: { i, from, to, pseq: s.seq[i], undo: false },
    bumps: s.bumps + 1,
    ev: "k" + i,
    noUndoAt: bySend ? s.n + 1 : s.noUndoAt,
  };
}

// The five reasons of the trash icon. "later" moves to Check Back Later. The other four move to
// Lost and the reason is stored.
export function loseCard(s: BoardState, i: number, reason: LostReason | "later"): BoardState {
  if (reason === "later") return moveCard(s, i, CHECK_BACK_LATER);
  const moved = moveCard(s, i, LOST);
  if (moved === s) return s;
  return { ...moved, rs: { ...moved.rs, [i]: reason } };
}

export function canUndo(s: BoardState): boolean {
  return !!s.last && !s.last.undo && s.noUndoAt !== s.n;
}

// Undo the last move. It also brings the view to the stage the card came from.
export function undoMove(s: BoardState): BoardState {
  const l = s.last;
  if (!l || l.undo || s.noUndoAt === s.n) return s;
  const sg = s.sg.slice();
  const seq = s.seq.slice();
  sg[l.i] = l.from;
  seq[l.i] = l.pseq;
  const rs = { ...s.rs };
  if (l.to === LOST) delete rs[l.i];
  return {
    ...s,
    sg,
    seq,
    rs,
    last: { i: l.i, from: l.to, to: l.from, pseq: 0, undo: true },
    stg: l.from,
    gch: false,
    bumps: s.bumps + 1,
    ev: "k" + l.i,
  };
}

export type BoardAction =
  | { type: "pick"; k: number; open?: boolean }
  | { type: "list" }
  | { type: "move"; i: number; to: number; bySend?: boolean }
  | { type: "lose"; i: number; reason: LostReason | "later" }
  | { type: "undo" };

export function boardReducer(s: BoardState, a: BoardAction): BoardState {
  switch (a.type) {
    case "pick":
      return pickStage(s, a.k, a.open);
    case "list":
      return backToList(s);
    case "move":
      return moveCard(s, a.i, a.to, a.bySend);
    case "lose":
      return loseCard(s, a.i, a.reason);
    case "undo":
      return undoMove(s);
  }
}
