// Types shared inside the today feature.

export type TodoKind = "lead" | "quote" | "job";

// 0 open, 1 done, 2 done the other way (No-show, Yes paid).
export type RowStatus = 0 | 1 | 2;

export type Todo = {
  id: string;
  kind: TodoKind;
  // Text before the bold name, for example "Call" or "Did the visit happen?".
  titleBefore: string;
  name: string;
  // Empty when the to-do has no amount.
  amount: string;
  detail: string;
  // Amber chip next to the detail (for example "Waiting 14 min"), if any.
  waiting?: string;
  primary: { label: string; short?: string };
  // The second answer, when the question has two (No-show, Yes, paid).
  secondary?: string;
  // What the system does next, per answer: [primary, secondary].
  done: readonly [string, string?];
  // A send of a quote or invoice opens the 20-second timer and has no Undo.
  send?: "Quote" | "Invoice";
};

export type NeedsFilter = "all" | TodoKind;
export type LeadRange = "today" | "week";

export type TodayState = {
  status: Readonly<Record<string, RowStatus>>;
  filter: NeedsFilter;
  range: LeadRange;
  // The thing pressed last ("row:<id>", "seg", "filter"), so a fade or a pop plays on that thing only.
  ev: string;
  bumps: number;
};

export type TodayAction =
  | { type: "set"; id: string; value: RowStatus }
  | { type: "filter"; filter: NeedsFilter }
  | { type: "range"; range: LeadRange };

export type Stop = {
  id: string;
  time: string;
  name: string;
  kind: "estimate" | "job";
  address: string;
  when: "past" | "next" | "later";
  // Chip text for the next stop.
  nextChip?: string;
  // The to-do whose answer shows as a chip on this (past) stop.
  visitOf?: string;
};

export type LeadChip = { tone: "warn" | "ok" | "plain"; text: string };

export type Lead = {
  name: string;
  init: string;
  need: string;
  // Time label in the "Today" list; absent when the lead is only in the week list.
  ago?: string;
  day: string;
  chip: LeadChip;
};

export type MiniRow = { name: string; note?: string; late?: string; amount: string };

export type MoneyBar = { height: number; label: string; on?: boolean };
