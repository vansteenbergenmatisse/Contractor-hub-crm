import { canUndo, type BoardAction } from "./board";
import { CHECK_BACK_LATER, LAST_STAGE, LOST, PAYMENT_DUE, STAGES } from "./stages";
import type { BoardState } from "../types";

// Moving a card to a stage the owner chose (by dragging it or from the stage sheet). Pure.

// A card's stage changed: card `i` is now in stage `to`. `undone`: the change was an Undo. `via`:
// "send" when a finished quote or invoice send moved it, "manual" for anything the owner did.
export type StageChange = { i: number; to: number; undone: boolean; via: "manual" | "send" };

// Stages only a send reaches, with the card button that does it.
const SEND_ONLY: Readonly<Record<number, string>> = { 4: "Use Send quote", [PAYMENT_DUE]: "Use Invoice" };

export type StageOption = { index: number; name: string; blocked?: string };

export type StageMovePlan =
  | { type: "none" }
  | { type: "move"; action: BoardAction }
  // Lost always asks for the reason first, as the trash button does.
  | { type: "ask-reason" };

// A card in Payment Due leaves only through its Mark paid button.
export function canMoveManually(stage: number): boolean {
  return stage !== PAYMENT_DUE;
}

// What the stage sheet lists for a card in `stage`. `blocked` says why a stage cannot be chosen.
export function stageOptions(stage: number): StageOption[] {
  if (!canMoveManually(stage)) return [];
  return STAGES.filter((s) => s.index !== stage).map((s) => ({ index: s.index, name: s.name, blocked: SEND_ONLY[s.index] }));
}

export function planStageMove(s: BoardState, i: number, to: number): StageMovePlan {
  const from = s.sg[i];
  if (from === undefined || to < 0 || to > LAST_STAGE || to === from) return { type: "none" };
  if (!canMoveManually(from) || SEND_ONLY[to]) return { type: "none" };
  return to === LOST ? { type: "ask-reason" } : { type: "move", action: { type: "move", i, to } };
}

// The stage change an action makes on this state, or null when no card changes stage.
export function stageChange(s: BoardState, a: BoardAction): StageChange | null {
  if (a.type === "undo") return canUndo(s) ? { i: s.last!.i, to: s.last!.from, undone: true, via: "manual" } : null;
  if (a.type !== "move" && a.type !== "lose") return null;
  const to = a.type === "move" ? a.to : a.reason === "later" ? CHECK_BACK_LATER : LOST;
  const from = s.sg[a.i];
  return from === undefined || from === to ? null : { i: a.i, to, undone: false, via: a.type === "move" && a.bySend ? "send" : "manual" };
}

// The group tab under the pointer, or -1. A hidden tab has no width and never matches.
export function groupAtPoint(x: number, y: number, tabs: readonly { left: number; right: number; top: number; bottom: number }[]): number {
  return tabs.findIndex((t) => t.right > t.left && x >= t.left && x < t.right && y >= t.top && y < t.bottom);
}

// The line a screen reader hears.
export function moveAnnouncement(name: string, to: number, undone: boolean): string {
  return undone ? `Undone. ${name} is back in ${STAGES[to].name}.` : `${name} moved to ${STAGES[to].name}.`;
}

// The stage column under the pointer, or -1. A hidden column has no width and never matches.
export function stageAtPoint(x: number, columns: readonly { stage: number; left: number; right: number }[]): number {
  return columns.find((c) => c.right > c.left && x >= c.left && x < c.right)?.stage ?? -1;
}
