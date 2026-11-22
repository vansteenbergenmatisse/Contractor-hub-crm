import { GROUPS, LAST_STAGE, STAGES, groupOf, hasTrash, secondButton } from "./stages";
import type { BoardState, CardView, MockCard, PrimaryKind, StubView, Tag } from "../types";

// Selectors: everything the screen shows, worked out from the board state. No React in here.

// The CSS has one rule per row up to this number (is-r0 to is-r47).
export const MAX_RANK = 47;

const NEEDS_PRICE_TEXT = "Needs service and price";

// Number of cards per stage, including the cards the board does not draw (`hidden`).
export function stageCounts(s: BoardState, hidden: readonly number[]): number[] {
  const n = STAGES.map((_, k) => hidden[k] ?? 0);
  for (const st of s.sg) n[st] += 1;
  return n;
}

export function groupCounts(counts: readonly number[]): number[] {
  return GROUPS.map((g) => {
    let t = 0;
    for (let k = g.first; k <= g.last; k++) t += counts[k];
    return t;
  });
}

export function isLive(s: BoardState): boolean {
  return !!s.last && !s.last.undo;
}

// The row of every card in its stage: cards that moved come first (the latest on top), then the
// rest in their old order. The note a moved card leaves in its old stage takes the row it had.
export function computeLayout(s: BoardState): { rank: number[]; stubRank: number } {
  const lists: { i: number; q: number; stub?: boolean }[][] = STAGES.map(() => []);
  s.sg.forEach((st, i) => lists[st].push({ i, q: s.seq[i] }));
  const l = s.last;
  if (l && !l.undo) lists[l.from].push({ i: l.i, q: l.pseq, stub: true });
  const rank: number[] = s.sg.map(() => 0);
  let stubRank = 0;
  for (const list of lists) {
    list.sort((x, y) => (x.q || y.q ? y.q - x.q : x.i - y.i));
    list.forEach((x, r) => {
      if (x.stub) stubRank = r;
      else rank[x.i] = r;
    });
  }
  return { rank, stubRank };
}

function motion(s: BoardState): string {
  return s.bumps % 2 ? "-a" : "-b";
}

// Does the quote of this card still need a service and a price?
export function needsPrice(card: MockCard): boolean {
  return card.quote === "need" || !card.amount;
}

function tagsFor(card: MockCard, st: number, home: boolean): [Tag | null, Tag | null] {
  let a: Tag | null = null;
  let b: Tag | null = null;
  if (st === 4) {
    if (home && card.since.startsWith("Opened")) a = { cls: "is-warn", text: card.since };
    else a = card.opened ? { cls: "is-ok", text: "Opened" } : { cls: "is-plain", text: "Not opened yet" };
  }
  if (st === 5) a = { cls: "is-ok", text: "Accepted" };
  if (st === 7) {
    a = { cls: "is-plain", text: card.returning ? "Returning customer" : "First-time customer" };
    b = card.review ? { cls: "is-ok", text: "Left a review" } : { cls: "is-plain", text: "No review yet" };
  }
  if (st === 8) {
    const d = home && card.since.includes("days late") ? parseInt(card.since, 10) : 0;
    a = { cls: d > 7 ? "is-hot" : d ? "is-bad" : "is-warn", text: home ? card.since : "Due in 7 days" };
  }
  return [a, b];
}

function timeFor(s: BoardState, card: MockCard, i: number, st: number, home: boolean): string {
  if (st === 4 && home && card.since.startsWith("Opened")) return "";
  if (st === 8) return "";
  if (st === 3 && card.since === NEEDS_PRICE_TEXT) return needsPrice(card) ? card.since : "Quote ready";
  if (st === 10 && s.rs[i]) return s.rs[i];
  return home ? card.since : "Moved just now";
}

export function cardView(s: BoardState, cards: readonly MockCard[], i: number, layout = computeLayout(s)): CardView {
  const card = cards[i];
  const st = s.sg[i];
  const l = s.last;
  const live = isLive(s);
  const noUndo = live && s.noUndoAt === s.n;
  const home = st === card.stage;
  const need = st === 3 && needsPrice(card);

  let primary: { label: string; kind: PrimaryKind; to: number } = { label: STAGES[st].button.label, kind: "move", to: STAGES[st].button.to };
  if (st === 3) primary = need ? { label: "Add price", kind: "add-price", to: 3 } : { label: "Send quote", kind: "send-quote", to: 4 };
  if (st === 7) primary = { label: STAGES[st].button.label, kind: "send-invoice", to: 8 };

  return {
    i,
    card,
    stage: st,
    className: `fd-kc is-s${st} is-r${Math.min(layout.rank[i], MAX_RANK)}${l && l.i === i ? " is-new" + motion(s) : ""}`,
    timeText: timeFor(s, card, i, st, home),
    autoText: need ? "The AI builds the quote after that" : STAGES[st].next,
    showUndo: live && l!.i === i && !noUndo,
    primary,
    second: secondButton(st),
    calendar: st === 2 || st === 6,
    trash: hasTrash(st),
    seeQuote: st === 3 && !need,
    tags: tagsFor(card, st, home),
  };
}

export function stubView(s: BoardState, cards: readonly MockCard[], layout = computeLayout(s)): StubView {
  const l = s.last;
  if (!l || l.undo) return { className: "fd-kstub is-off", name: "", to: "", auto: "", showClassName: "fd-btn fd-kshow" };
  const hot = s.ev === "k" + l.i;
  const nou = s.noUndoAt === s.n;
  return {
    className: `fd-kstub is-s${l.from} is-r${Math.min(layout.stubRank, MAX_RANK)}${hot ? " is-new" + motion(s) : ""}${nou ? " is-nou" : ""}`,
    name: cards[l.i].name,
    to: STAGES[l.to].name,
    auto: STAGES[l.to].next,
    showClassName: "fd-btn fd-kshow" + (groupOf(l.to) === groupOf(l.from) ? " is-same" : ""),
  };
}

// The number badge of a stage ticks when a move touches it.
export function countClass(s: BoardState, k: number): string {
  const l = s.last;
  const hot = !!l && s.ev === "k" + l.i;
  return "fd-kcn" + (hot && (l!.to === k || l!.from === k) ? " fd-tick" + motion(s) : "");
}

export function emptyClass(s: BoardState, counts: readonly number[], k: number): string {
  const l = s.last;
  const off = counts[k] || (isLive(s) && l!.from === k);
  return `fd-kempty is-s${k}${off ? " is-off" : ""}`;
}

export function headerClass(s: BoardState, k: number): string {
  return `fd-kh is-s${k}${s.stg === k ? " is-sel" : ""}`;
}

export function stageButtonClass(s: BoardState, k: number): string {
  return "fd-sti" + (groupOf(k) === groupOf(s.stg) ? " is-in" : "") + (s.stg === k ? " is-on" : "");
}

export function groupButtonClass(s: BoardState, g: number): string {
  return "fd-sgb" + (g === groupOf(s.stg) ? " is-on" : "");
}

export function boardClass(s: BoardState): string {
  return `fd-kb is-g${groupOf(s.stg)} is-st${s.stg}${s.open ? " is-open" : ""}`;
}

export function mapClass(s: BoardState): string {
  return "fd-smap" + (s.ev === "stg" && !s.open ? " is-sw" + (s.sw % 2 ? "-a" : "-b") : "");
}

export function gridClass(s: BoardState): string {
  return "fd-kg" + (s.ev === "stg" ? " is-sw" + (s.sw % 2 ? "-a" : "-b") + (s.gch ? " is-gch" : "") : "");
}

// Which of the five column lines on the computer is the selected one.
export function lineSelected(s: BoardState): boolean[] {
  const g = GROUPS[groupOf(s.stg)];
  return [0, 1, 2, 3, 4].map((j) => j === s.stg - g.first);
}

// "Next stage: Quote to Send (3)". Empty on the last stage.
export function nextStageLabel(s: BoardState, counts: readonly number[]): string {
  return s.stg < LAST_STAGE ? `${STAGES[s.stg + 1].name} (${counts[s.stg + 1]})` : "";
}
