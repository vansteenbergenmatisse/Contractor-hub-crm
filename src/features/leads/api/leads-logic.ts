import { weekRange } from "@/features/calendar";
import type {
  AddedLead, FocusField, FormErrors, FormValues, Lead, LeadsAction, LeadsState, LeadStatus, SourceCounts, SourceKey,
  Summary, WaitFilter, WaitLevel,
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

// The wait in words, from minutes: 14 min, 1 hr, 5 hrs, 1 day, 2 days. Copied from the Inbox's
// waitText on purpose (features do not import each other's internals); keep the two the same.
export function waitText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  }
  const days = Math.floor(minutes / 1440);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

// The time on the row's second line: how long a waiting lead waits, else when the lead came in.
export function rowWhen(lead: Lead): string {
  return lead.minutesWaiting > 0 ? waitText(lead.minutesWaiting) : (lead.received ?? "");
}

// Keys on the filter control (a radio group): arrows move and wrap, Home and End jump. -1: not ours.
export function filterKeyIndex(key: string, index: number, n: number): number {
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % n;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index + n - 1) % n;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return -1;
}

// "Add a lead": a bottom sheet on a phone; on a computer the form is always beside the list, so the
// button only takes you there.
export function addLeadMode(phone: boolean): "sheet" | "form" {
  return phone ? "sheet" : "form";
}

// A lead waits on you when it needs a call back or a reply.
export function isWaiting(status: LeadStatus): boolean {
  return status === "call" || status === "reply";
}

// How many hand-added leads the list shows (the newest first).
export const MAX_ADDED = 3;

const NO_ERRORS: FormErrors = { name: "", phone: "", email: "" };
const EMPTY_FORM: FormValues = { name: "", phone: "", email: "", addr: "", need: "" };

export function createInitialState(leads: readonly Lead[]): LeadsState {
  const status: Record<string, LeadStatus> = {};
  for (const l of leads) status[l.id] = l.status;
  return {
    status, initial: { ...status }, filter: "all", added: [], nAdd: 0, auto: false, old: "idle", sheet: false,
    form: { ...EMPTY_FORM }, errors: { ...NO_ERRORS }, focus: null,
  };
}

// Fresh server rows into kept screen state. A lead whose server status is unchanged keeps what the
// owner did on screen; a new lead or a changed status takes the server's; a lead that is gone is
// removed. Answers the same object when nothing changed.
export function mergeLeads(state: LeadsState, leads: readonly Lead[]): LeadsState {
  const status: Record<string, LeadStatus> = {};
  const initial: Record<string, LeadStatus> = {};
  for (const l of leads) {
    const kept = state.status[l.id];
    status[l.id] = kept !== undefined && state.initial[l.id] === l.status ? kept : l.status;
    initial[l.id] = l.status;
  }
  const same = (a: Record<string, LeadStatus>, b: Record<string, LeadStatus>) => {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
  };
  return same(status, state.status) && same(initial, state.initial) ? state : { ...state, status, initial };
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
    case "sync":
      return mergeLeads(state, action.leads);
    case "call":
      // A real contact has no call log here: nothing may claim it was called.
      return action.id in state.status && state.status[action.id] !== "new" ? { ...state, status: { ...state.status, [action.id]: "called" } } : state;
    case "book": {
      const now = state.status[action.id];
      if (now === undefined || now === "new") return state;
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
        id: `added-${state.nAdd + 1}`,
        name: f.name.trim(),
        sub: [f.need.trim() || "New lead", f.phone.trim(), f.email.trim(), f.addr.trim()].filter(Boolean).join(" · "),
      };
      return {
        // The list keeps the newest 3 hand-added leads (design logic 804 `.slice(0, 3)`).
        ...state, sheet: false, filter: "all", added: [added, ...state.added].slice(0, MAX_ADDED), nAdd: state.nAdd + 1, form: { ...EMPTY_FORM },
        errors: { ...NO_ERRORS }, focus: null,
      };
    }
  }
}

// An added lead has just arrived, so it counts as waiting under 1 hour.
export function filterCounts(leads: readonly Lead[], state: LeadsState): Record<WaitFilter, number> {
  const counts: Record<WaitFilter, number> = { all: leads.length + state.added.length, warn: state.added.length, bad: 0, hot: 0 };
  for (const l of leads) if (isWaiting(state.status[l.id])) counts[waitLevel(l.minutesWaiting)]++;
  return counts;
}

export function visibleLeads(leads: readonly Lead[], state: LeadsState): Lead[] {
  return leads.filter((l) => state.filter === "all" || (isWaiting(state.status[l.id]) && waitLevel(l.minutesWaiting) === state.filter));
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
  for (const l of waiting) if (!oldest || l.minutesWaiting > oldest.minutesWaiting) oldest = l;
  if (oldest) {
    const first = oldest.name.split(" ")[0];
    const reply = state.status[oldest.id] === "reply";
    return {
      tone: waitLevel(oldest.minutesWaiting),
      a,
      b: n === 1 ? `${first} waits ${waitText(oldest.minutesWaiting)}.` : `${first} waits longest: ${waitText(oldest.minutesWaiting)}.`,
      button: `${reply ? "Reply to" : "Call"} ${first}`,
      target: { id: oldest.id, kind: reply ? "reply" : "call" },
    };
  }
  if (n) return { tone: "warn", a, b: "You added them just now.", button: "", target: null };
  return { tone: "calm", a: "Nobody waits on you.", b: "New leads show up here first.", button: "", target: null };
}

const dayKey = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);

const receivedTimes = (leads: readonly Lead[]) =>
  leads.flatMap((l) => {
    const ms = l.receivedAt ? Date.parse(l.receivedAt) : Number.NaN;
    return Number.isNaN(ms) ? [] : [ms];
  });

// True when at least one lead carries a real wait or status. Real contacts do not yet.
export function hasWaitData(leads: readonly Lead[]): boolean {
  return leads.some((l) => l.status !== "new");
}

// "This week" is the calendar's week (Sunday start) in the given zone, up to the moment of the load.
// Null when the zone or the load time is unusable.
function thisWeek(loadedAt: string, timeZone: string): { startMs: number; nowMs: number } | null {
  const nowMs = Date.parse(loadedAt);
  const range = weekRange(timeZone, null, new Date(nowMs));
  return range ? { startMs: range.startMs, nowMs } : null;
}

export function isThisWeek(ms: number, loadedAt: string, timeZone: string): boolean {
  const week = thisWeek(loadedAt, timeZone);
  return week !== null && ms >= week.startMs && ms <= week.nowMs;
}

// With more contacts beyond the loaded page, a count is only known when the page reaches past the
// start of the week; otherwise it would undercount. A row left out or without a usable date could
// fall inside the week, so no count is proven then. Without a usable zone no week is proven.
export function weekKnown(leads: readonly Lead[], loadedAt: string, complete: boolean, dropped = 0, timeZone?: string): boolean {
  const times = receivedTimes(leads);
  if (dropped > 0 || times.length !== leads.length || !timeZone) return false;
  const week = thisWeek(loadedAt, timeZone);
  if (!week) return false;
  if (complete) return true;
  return times.length > 0 && Math.min(...times) < week.startMs;
}

type TileContext = { loadedAt: string; complete: boolean; timeZone: string; dropped?: number };

// The three tiles, from real rows. Null: there is no honest number, so the tile is hidden. A lead
// added on screen shows in the list and the sources panel, not in New today or This week.
export function tiles(leads: readonly Lead[], state: LeadsState, context: TileContext): { today: number | null; week: number | null; wait: number | null } {
  const now = Date.parse(context.loadedAt);
  const times = receivedTimes(leads);
  const todayKey = dayKey(now, context.timeZone);
  const dropped = context.dropped ?? 0;
  const allDated = dropped === 0 && times.length === leads.length;
  const todayKnown = allDated && (context.complete || (times.length > 0 && dayKey(Math.min(...times), context.timeZone) !== todayKey));
  return {
    today: todayKnown ? times.filter((t) => dayKey(t, context.timeZone) === todayKey).length : null,
    week: weekKnown(leads, context.loadedAt, context.complete, dropped, context.timeZone) ? times.filter((t) => isThisWeek(t, context.loadedAt, context.timeZone)).length : null,
    wait: hasWaitData(leads) ? waitingCount(leads, state) : null,
  };
}

// When a contact came in, in the viewer's time zone: 14 min, 2 hrs, Yesterday, Tuesday, Mar 3.
export function receivedLabel(receivedAt: string, loadedAt: string, timeZone: string): string {
  const at = Date.parse(receivedAt);
  const now = Date.parse(loadedAt);
  if (Number.isNaN(at) || Number.isNaN(now)) return "";
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "Just now";
  const today = dayKey(now, timeZone);
  if (dayKey(at, timeZone) === today) return waitText(minutes);
  // Noon UTC of each calendar date: whole days between them, whatever the clock change.
  const dayNumber = (key: string) => Math.round(Date.parse(`${key}T12:00:00Z`) / 86_400_000);
  const days = dayNumber(today) - dayNumber(dayKey(at, timeZone));
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(at);
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(at);
}

export function withReceived(leads: readonly Lead[], loadedAt: string, timeZone: string): Lead[] {
  return leads.map((l) => (l.receivedAt ? { ...l, received: receivedLabel(l.receivedAt, loadedAt, timeZone) } : l));
}

// Only exact, obvious values name a channel. Anything else stays unlabelled.
const SOURCE_VALUES: Readonly<Record<string, SourceKey>> = {
  call: "call", "phone call": "call", "inbound call": "call",
  form: "form", "web form": "form", "website form": "form",
  text: "text", sms: "text", "text message": "text",
  gmb: "gmb", "google my business": "gmb", "google business profile": "gmb",
  facebook: "fb", fb: "fb",
  instagram: "ig", ig: "ig",
};

export function sourceKey(value: string | null | undefined): SourceKey | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return Object.hasOwn(SOURCE_VALUES, key) ? SOURCE_VALUES[key] : null;
}

const NO_SOURCES: Readonly<Record<SourceKey, number>> = { call: 0, form: 0, text: 0, gmb: 0, fb: 0, ig: 0 };

// This week's leads per channel. Unlabelled leads count in the total, in no channel.
export function sourceCounts(leads: readonly Lead[], loadedAt: string, timeZone: string): SourceCounts {
  const byKey = { ...NO_SOURCES };
  let unlabelled = 0;
  let total = 0;
  for (const l of leads) {
    const at = l.receivedAt ? Date.parse(l.receivedAt) : Number.NaN;
    if (Number.isNaN(at) || !isThisWeek(at, loadedAt, timeZone)) continue;
    total += 1;
    if (l.source) byKey[l.source] += 1;
    else unlabelled += 1;
  }
  return { byKey, unlabelled, total };
}

export const SOURCE_LABEL: Record<SourceKey | "you", string> = {
  call: "Call", form: "Web form", text: "Text", gmb: "Google My Business", fb: "Facebook", ig: "Instagram", you: "Added by you",
};

const SOURCE_ORDER: SourceKey[] = ["call", "form", "text", "gmb", "fb", "ig"];

// The bar is 25% per lead, full at 4.
export function sourceRows(nAdded: number, counts: Readonly<Record<SourceKey, number>> = NO_SOURCES): Array<{ key: SourceKey | "you"; label: string; count: number; width: number }> {
  const bar = (n: number) => Math.min(100, 25 * n);
  return [
    ...SOURCE_ORDER.map((key) => ({ key, label: SOURCE_LABEL[key], count: counts[key], width: bar(counts[key]) })),
    { key: "you" as const, label: SOURCE_LABEL.you, count: nAdded, width: bar(nAdded) },
  ];
}
