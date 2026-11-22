// MOCK DATA (Phase 2). The design's sample to-dos, calendar, leads and money cards. Replaced in
// Phase 3 by reads from HighLevel (to-dos by urgency, tiles, today's calendar, leads, money cards).
// Never treat any name, amount or text here as a real fact. Business details (name, phone, email,
// address, website) never go in this file: they come from MOCK_BUSINESS in `@/shared/mock/business`.
import type { Lead, MiniRow, MoneyBar, Stop, Todo } from "./types";

export const TODOS: readonly Todo[] = [
  {
    id: "maria", kind: "lead", titleBefore: "Call", name: "Maria Alvarez", amount: "", detail: "New lead · Roof leak repair",
    waiting: "Waiting 14 min", primary: { label: "Call" }, done: ["Called. The follow-up texts stop."],
  },
  {
    id: "jordan", kind: "lead", titleBefore: "Reply to", name: "Jordan Reyes", amount: "", detail: "Texted back 20 min ago about a Saturday visit",
    primary: { label: "Reply" }, done: ["Replied. The chase texts stay off."],
  },
  {
    id: "raj", kind: "quote", titleBefore: "Call", name: "Raj Patel", amount: "$12,900", detail: "Opened your quote 3 times today · Gutter replacement",
    primary: { label: "Call" }, done: ["Called. Logged on Raj’s quote."],
  },
  {
    id: "derek", kind: "quote", titleBefore: "Approve the quote for", name: "Derek Olsen", amount: "$18,400", detail: "Full roof replacement · built from your service and price",
    primary: { label: "Approve" }, done: ["Approved. The quote is on its way to Derek."], send: "Quote",
  },
  {
    id: "tom", kind: "job", titleBefore: "Did the visit happen?", name: "Tom Becker", amount: "", detail: "Estimate today at 8:30 AM",
    primary: { label: "Visit done" }, secondary: "No-show",
    done: ["Visit done. Add the service and the price.", "No-show. The chase texts start."],
  },
  {
    id: "whitmore", kind: "job", titleBefore: "Is the job done?", name: "Whitmore Dental", amount: "$2,350", detail: "Flat roof patch · booked for yesterday",
    primary: { label: "Yes, send invoice", short: "Yes, invoice" }, secondary: "Yes, paid", send: "Invoice",
    done: ["Job done. Invoice sent. The review request follows in one hour.", "Job done and paid. The review request follows in one hour."],
  },
];

export const STOPS: readonly Stop[] = [
  { id: "s-tom", time: "8:30 AM", name: "Tom Becker", kind: "estimate", address: "214 Maple Ridge Dr, Dublin", when: "past", visitOf: "tom" },
  { id: "s-linda", time: "11:00 AM", name: "Linda Park", kind: "estimate", address: "88 Olentangy St, Columbus", when: "next", nextChip: "Next · in 20 min" },
  { id: "s-carlos", time: "1:30 PM", name: "Carlos Mendez", kind: "estimate", address: "1502 Main St, Hilliard", when: "later" },
  { id: "s-owen", time: "3:00 PM", name: "Owen Fletcher", kind: "job", address: "4100 Sawmill Rd, Columbus", when: "later" },
];

const booked = { tone: "ok", text: "Estimate booked" } as const;
const following = { tone: "plain", text: "Following up" } as const;
const quoteSent = { tone: "plain", text: "Quote sent" } as const;

// The first four have `ago` (the Today list); all thirteen are in the week list.
export const LEADS: readonly Lead[] = [
  { name: "Maria Alvarez", init: "MA", need: "Roof leak repair", ago: "14 min ago", day: "Today", chip: { tone: "warn", text: "Call back" } },
  { name: "Jordan Reyes", init: "JR", need: "Gutter cleaning", ago: "1 hr ago", day: "Today", chip: { tone: "warn", text: "Reply" } },
  { name: "Sam Whitaker", init: "SW", need: "Roof replacement", ago: "2 hrs ago", day: "Today", chip: booked },
  { name: "Ellen Novak", init: "EN", need: "Skylight leak", ago: "3 hrs ago", day: "Today", chip: { tone: "plain", text: "Auto-reply sent" } },
  { name: "Linda Park", init: "LP", need: "Shingle repair", day: "Thursday", chip: booked },
  { name: "Carlos Mendez", init: "CM", need: "Roof inspection", day: "Thursday", chip: booked },
  { name: "Hannah Brooks", init: "HB", need: "Roof inspection", day: "Thursday", chip: following },
  { name: "Tom Becker", init: "TB", need: "Roof inspection", day: "Wednesday", chip: booked },
  { name: "Dana Kim", init: "DK", need: "Gutter guards", day: "Wednesday", chip: following },
  { name: "Derek Olsen", init: "DO", need: "Full roof replacement", day: "Tuesday", chip: { tone: "plain", text: "Quote ready" } },
  { name: "Owen Fletcher", init: "OF", need: "Roof repair", day: "Tuesday", chip: booked },
  { name: "Raj Patel", init: "RP", need: "Gutter replacement", day: "Monday", chip: quoteSent },
  { name: "Nina Castillo", init: "NC", need: "Skylight install", day: "Monday", chip: quoteSent },
];

// Tiles that do not follow from a list on this page. Sample counts.
export const JOBS_TILE = { value: 6, today: 1 } as const;
export const INVOICES_TILE = { value: 4, ready: 1 } as const;

export const BOOKED = {
  total: "$48,200",
  trend: "18% more than last week",
  aria: "Booked per week, last 6 weeks. This week is the highest: $48,200.",
  bars: [
    { height: 65, label: "Oct 5" },
    { height: 79, label: "Oct 12" },
    { height: 57, label: "Oct 19" },
    { height: 91, label: "Oct 26" },
    { height: 85, label: "Nov 2" },
    { height: 100, label: "This week", on: true },
  ] satisfies readonly MoneyBar[],
};

export const QUOTES_OUT = {
  total: "$62,250",
  rows: [
    { name: "Harlan Realty", note: "Sent yesterday", amount: "$31,400" },
    { name: "Raj Patel", note: "Opened 3 times", amount: "$12,900" },
    { name: "Nina Castillo", note: "No answer for 6 days", amount: "$8,200" },
  ] satisfies readonly MiniRow[],
  foot: "5 quotes · you win 3 of 10",
};

export const MONEY_OWED = {
  total: "$23,750",
  rows: [
    { name: "Bright Daycare", late: "14 days late", amount: "$9,400" },
    { name: "Grace Whitfield", late: "6 days late", amount: "$4,850" },
    { name: "Paul Ortega", note: "Due Nov 20", amount: "$9,500" },
  ] satisfies readonly MiniRow[],
  foot: "3 invoices · 2 late",
};

// The design's sample first name for the greeting until the shell passes the owner's.
export const MOCK_OWNER_FIRST = "Mike";
