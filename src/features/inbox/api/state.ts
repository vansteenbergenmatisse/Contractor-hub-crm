import type { Conversation, Filter, InboxAction, InboxState, TextBusiness } from "../types";
import { waitLabel, waitLevelClass, waitText, waitTier } from "./wait";
import { fillText, replyName } from "./text";

export function initialState(conversations: readonly Conversation[]): InboxState {
  return {
    needs: Object.fromEntries(conversations.map((c) => [c.id, c.needsReply])),
    selected: conversations[0]?.id ?? "",
    open: false,
    filter: "all",
    sent: Object.fromEntries(conversations.map((c) => [c.id, []])),
    bumps: 0,
    swaps: 0,
    event: "",
  };
}

// Local state only. Nothing here sends anything.
export function inboxReducer(state: InboxState, action: InboxAction): InboxState {
  switch (action.type) {
    case "open": {
      const changed = action.id !== state.selected || !state.open;
      return { ...state, selected: action.id, open: true, swaps: state.swaps + (changed ? 1 : 0), event: "open" };
    }
    case "replyTo":
      return { ...state, filter: "all", selected: action.id, open: true, swaps: state.swaps + 1, event: "open" };
    case "send": {
      const text = action.text.trim();
      if (!text) return state;
      return {
        ...state,
        sent: { ...state.sent, [state.selected]: [...(state.sent[state.selected] ?? []), text] },
        needs: { ...state.needs, [state.selected]: false },
        bumps: state.bumps + 1,
        event: "send",
      };
    }
    case "toggleDone":
      return { ...state, needs: { ...state.needs, [state.selected]: !state.needs[state.selected] }, bumps: state.bumps + 1, event: "done" };
    case "toList":
      return { ...state, open: false, event: "list" };
    case "filter":
      return state.filter === action.filter ? state : { ...state, filter: action.filter, event: "flt" };
  }
}

export function waitingCount(state: InboxState): number {
  return Object.values(state.needs).filter(Boolean).length;
}

export function isVisible(state: InboxState, c: Conversation): boolean {
  return state.filter === "all" || (!!state.needs[c.id] && waitTier(c.minutesWaiting) === state.filter);
}

export function visibleCount(state: InboxState, conversations: readonly Conversation[]): number {
  return conversations.filter((c) => isVisible(state, c)).length;
}

// Counts on the filter control: all conversations, then the waiting ones per tier.
export function filterCounts(state: InboxState, conversations: readonly Conversation[]): Record<Filter, number> {
  const counts: Record<Filter, number> = { all: conversations.length, warn: 0, bad: 0, hot: 0 };
  for (const c of conversations) if (state.needs[c.id]) counts[waitTier(c.minutesWaiting)] += 1;
  return counts;
}

export type Summary = { calm: boolean; cls: string; lead: string; rest: string; button: string; targetId: string | null };

// How many wait, who waits longest (the earliest in the list on a tie) and who the button opens.
export function summarize(state: InboxState, conversations: readonly Conversation[]): Summary {
  const waiting = conversations.filter((c) => state.needs[c.id]);
  if (waiting.length === 0) {
    return { calm: true, cls: "fd-wsum is-calm", lead: "Nobody waits on you.", rest: "New messages show up here first.", button: "", targetId: null };
  }
  let oldest = waiting[0];
  for (const c of waiting) if (c.minutesWaiting > oldest.minutesWaiting) oldest = c;
  const who = replyName(oldest.name, oldest.channel);
  const one = waiting.length === 1;
  return {
    calm: false,
    cls: `fd-wsum ${waitLevelClass(oldest.minutesWaiting)}`,
    lead: one ? "1 person waits on you." : `${waiting.length} people wait on you.`,
    rest: one ? `${who} waits ${waitText(oldest.minutesWaiting)}.` : `${who} waits longest: ${waitText(oldest.minutesWaiting)}.`,
    button: `Reply to ${who}`,
    targetId: oldest.id,
  };
}

// The newest line of the row: your own new message, else the sample text with the business facts filled in.
export function rowSnippet(state: InboxState, c: Conversation, business: TextBusiness): string {
  const mine = state.sent[c.id] ?? [];
  const last = mine[mine.length - 1];
  return last !== undefined ? `You: ${last}` : fillText(c.snippet, business);
}

export function rowTime(state: InboxState, c: Conversation): string {
  return (state.sent[c.id] ?? []).length ? "Just now" : c.time;
}

export function rowWaitLabel(c: Conversation): string {
  return waitLabel(c.minutesWaiting);
}

export function replyLabel(c: Conversation): string {
  return `Reply to ${replyName(c.name, c.channel)} ${c.via}`;
}

// BACKEND: Delivered comes from the text provider's report, Seen from the Facebook and Instagram read
// receipts. Email shows neither. Mock until Phase 3.
export function deliveryLabel(state: InboxState, c: Conversation): { show: boolean; text: "Seen" | "Delivered" } {
  const text = c.channel === "Facebook" || c.channel === "Instagram" ? "Seen" : "Delivered";
  const show = ((state.sent[c.id] ?? []).length > 0 || c.lastIsOutgoing) && c.channel !== "Email";
  return { show, text };
}

export function doneLabel(state: InboxState, c: Conversation): string {
  return state.needs[c.id] ? "Mark done" : "Flag for reply";
}
