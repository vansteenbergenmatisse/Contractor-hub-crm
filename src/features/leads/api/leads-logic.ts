import { MOCK_NEW_TODAY, MOCK_WEEK_SOURCES } from "../mock";
import type {
  AddedLead, FocusField, FormErrors, FormValues, Lead, LeadsAction, LeadsState, LeadStatus, SourceKey, Summary,
  WaitFilter, WaitLevel,
} from "../types";

// Pure screen logic for Leads. No fetch, no timer, no automation: every change is local state.

// Same rule as the Inbox (copied on purpose, features do not import each other's internals):
// under 1 hour amber, 1 to 24 hours light red, 24 hours or more full red.
export function waitLevel(mins: number): WaitLevel {
  return mins >= 1440 ? "hot" : mins >= 60 ? "bad" : "warn";
}
export function waitClass(mins: number): "is-warn" | "is-bad" | "is-hot" {
  return `is-${waitLevel(mins)}`;
}

// A lead waits on you when it needs a call back or a reply.
export function isWaiting(status: LeadStatus): boolean {
  return status === "call" || status === "reply";
}

const NO_ERRORS: FormErrors = { name: "", phone: "", email: "" };
const EMPTY_FORM: FormValues = { name: "", phone: "", email: "", addr: "", need: "" };

export function createInitialState(leads: readonly Lead[]): LeadsState {
  const status: Record<string, LeadStatus> = {};
  for (const l of leads) status[l.id] = l.status;
  return {
    status, initial: { ...status }, filter: "all", added: [], auto: false, old: "idle", sheet: false,
    form: { ...EMPTY_FORM }, errors: { ...NO_ERRORS }, focus: null,
  };
}

export function validateLead(form: FormValues): { errors: FormErrors; focus: FocusField | null } {
  const name = form.name.trim();
  const phone = form.phone.trim();
  const email = form.email.trim();
  const errors: FormErrors = {
    name: name ? "" : "Enter a name.",
    phone: phone.replace(/\D/g, "").length >= 7 ? "" : "Enter a phone number.",
    email: !email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? "" : "That email looks off. Check it for a typo.",
  };
  const focus: FocusField | null = errors.name ? "name" : errors.phone ? "phone" : errors.email ? "email" : null;
  return { errors, focus };
}

export function leadsReducer(state: LeadsState, action: LeadsAction): LeadsState {
  switch (action.type) {
    case "call":
      return action.id in state.status ? { ...state, status: { ...state.status, [action.id]: "called" } } : state;
    case "book": {
      const now = state.status[action.id];
      if (now === undefined) return state;
      const start = state.initial[action.id];
      const next: LeadStatus = now === "booked" ? (start === "booked" ? "follow" : start) : "booked";
      return { ...state, status: { ...state.status, [action.id]: next } };
    }
    case "filter":
      return { ...state, filter: action.filter };
    case "openAdd":
      return { ...state, sheet: true };
    case "closeAdd":
      return { ...state, sheet: false, errors: { ...NO_ERRORS } };
    case "field":
      return { ...state, form: { ...state.form, [action.field]: action.value } };
    case "toggleAuto":
      return { ...state, auto: !state.auto };
    case "old":
      return { ...state, old: action.to };
    case "submit": {
      const { errors, focus } = validateLead(state.form);
      if (focus) return { ...state, errors, focus: { field: focus, tick: (state.focus?.tick ?? 0) + 1 } };
      const f = state.form;
      const added: AddedLead = {
        id: `added-${state.added.length + 1}`,
        name: f.name.trim(),
        sub: [f.need.trim() || "New lead", f.phone.trim(), f.email.trim(), f.addr.trim()].filter(Boolean).join(" · "),
      };
      return {
        ...state, sheet: false, filter: "all", added: [added, ...state.added], form: { ...EMPTY_FORM },
        errors: { ...NO_ERRORS }, focus: null,
      };
    }
  }
}

// An added lead has just arrived, so it counts as waiting under 1 hour.
export function filterCounts(leads: readonly Lead[], state: LeadsState): Record<WaitFilter, number> {
  const counts: Record<WaitFilter, number> = { all: leads.length + state.added.length, warn: state.added.length, bad: 0, hot: 0 };
  for (const l of leads) if (isWaiting(state.status[l.id])) counts[waitLevel(l.mins)]++;
  return counts;
}

export function visibleLeads(leads: readonly Lead[], state: LeadsState): Lead[] {
  return leads.filter((l) => state.filter === "all" || (isWaiting(state.status[l.id]) && waitLevel(l.mins) === state.filter));
}

export function visibleAdded(state: LeadsState): AddedLead[] {
  return state.filter === "all" || state.filter === "warn" ? state.added : [];
}

export function firstNeedId(leads: readonly Lead[], state: LeadsState): string | null {
  return leads.find((l) => isWaiting(state.status[l.id]))?.id ?? null;
}

export function waitingCount(leads: readonly Lead[], state: LeadsState): number {
  return leads.filter((l) => isWaiting(state.status[l.id])).length + state.added.length;
}

export function summarize(leads: readonly Lead[], state: LeadsState): Summary {
  const waiting = leads.filter((l) => isWaiting(state.status[l.id]));
  const n = waiting.length + state.added.length;
  const a = n === 1 ? "1 lead waits on you." : `${n} leads wait on you.`;
  let oldest: Lead | null = null;
  for (const l of waiting) if (!oldest || l.mins > oldest.mins) oldest = l;
  if (oldest) {
    const first = oldest.name.split(" ")[0];
    const reply = state.status[oldest.id] === "reply";
    return {
      tone: waitLevel(oldest.mins),
      a,
      b: n === 1 ? `${first} waits ${oldest.when}.` : `${first} waits longest: ${oldest.when}.`,
      button: `${reply ? "Reply to" : "Call"} ${first}`,
      target: { id: oldest.id, kind: reply ? "reply" : "call" },
    };
  }
  if (n) return { tone: "warn", a, b: "You added them just now.", button: "", target: null };
  return { tone: "calm", a: "Nobody waits on you.", b: "New leads show up here first.", button: "", target: null };
}

export function tiles(leads: readonly Lead[], state: LeadsState): { today: number; week: number; wait: number } {
  const week = Object.values(MOCK_WEEK_SOURCES).reduce((n, c) => n + c, 0);
  return { today: MOCK_NEW_TODAY + state.added.length, week: week + state.added.length, wait: waitingCount(leads, state) };
}

export const SOURCE_LABEL: Record<SourceKey | "you", string> = {
  call: "Call", form: "Web form", text: "Text", gmb: "Google My Business", fb: "Facebook", ig: "Instagram", you: "Added by you",
};

const SOURCE_ORDER: SourceKey[] = ["call", "form", "text", "gmb", "fb", "ig"];

// The bar is 25% per lead, full at 4.
export function sourceRows(nAdded: number): Array<{ key: SourceKey | "you"; label: string; count: number; width: number }> {
  const bar = (n: number) => Math.min(100, 25 * n);
  return [
    ...SOURCE_ORDER.map((key) => ({ key, label: SOURCE_LABEL[key], count: MOCK_WEEK_SOURCES[key], width: bar(MOCK_WEEK_SOURCES[key]) })),
    { key: "you" as const, label: SOURCE_LABEL.you, count: nAdded, width: bar(nAdded) },
  ];
}
