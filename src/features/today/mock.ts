// MOCK DATA (Phase 2). The design's sample to-dos, calendar, leads and money cards. Replaced in
// Phase 3 by reads from HighLevel (to-dos by urgency, tiles, today's calendar, leads, money cards).
// Never treat any name, amount or text here as a real fact. Business details (name, owner, phone, email,
// address, website) never go in this file: they come from the sub-account's custom values (`useBusiness`).
// Test fixtures only: no production file imports this module.
import type { SearchRow, SendDoc } from "@/features/app-shell";
import { buildMockInvoices, chipFor } from "@/features/invoices";
import { sendRequest as quoteSendRequest, type QuotesState } from "@/features/quotes";
import type { MoneyData } from "./components/MoneyCards";
import type { Lead, LeadRange, MiniRow, MoneyBar, OwedRow, Stop, Todo } from "./types";

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
    { name: "Bright Daycare", invoiceNo: 1042, amount: "$9,400" },
    { name: "Grace Whitfield", invoiceNo: 1044, amount: "$4,850" },
    { name: "Paul Ortega", invoiceNo: 1045, amount: "$9,500" },
  ] satisfies readonly OwedRow[],
  foot: "3 invoices · 2 late",
};

export const leadsFor = (range: LeadRange): readonly Lead[] => (range === "today" ? LEADS.filter((l) => l.ago) : LEADS);

// The quote document the Quotes page would send for this to-do's customer (design logic 1060
// `q.docOf(j)`: the quote's own lines), or null when Quotes has no quote with that name.
export function quoteDocFor(todo: Todo, quotes: readonly QuotesState["quotes"][number][]): SendDoc | null {
  if (todo.send !== "Quote") return null;
  const quote = quotes.find((q) => q.name === todo.name);
  return quote ? quoteSendRequest(quote, () => {}).doc : null;
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Sample search rows: the leads, the quotes out, the money owed.
export const searchRows: readonly SearchRow[] = [
  ...LEADS.map((l): SearchRow => ({ id: `today-lead-${slug(l.name)}`, page: "leads", name: l.name, sub: `${l.need} · ${l.chip.text}`, href: "/leads" })),
  ...QUOTES_OUT.rows.map((r): SearchRow => ({ id: `today-quote-${slug(r.name)}`, page: "quotes", name: r.name, sub: `Quote ${r.amount} · ${r.note ?? ""}`.trim(), href: "/quotes" })),
  ...MONEY_OWED.rows.map((r): SearchRow => ({ id: `today-owed-${slug(r.name)}`, page: "payments", name: r.name, sub: `Owes ${r.amount}`, href: "/payments" })),
];

// Money owed rows with the due day or lateness taken from the Invoices page's sample invoices on
// `now`, so both pages say the same ("Due Nov 22" / "6 days late"). A late invoice gets the red chip.
// With no `now` yet (server render, hydration) the rows show without the due day.
export function owedRows(rows: readonly OwedRow[], now: Date | null): MiniRow[] {
  if (!now) return rows.map((r) => ({ name: r.name, amount: r.amount, note: "" }));
  const invoices = buildMockInvoices(now);
  return rows.map((r) => {
    const inv = invoices.find((i) => i.no === r.invoiceNo);
    const chip = inv ? chipFor(inv, now) : null;
    const late = !!chip && (chip.tone === "is-bad" || chip.tone === "is-hot");
    return { name: r.name, amount: r.amount, ...(late ? { late: chip.text } : { note: chip?.text ?? "" }) };
  });
}

export const SAMPLE_MONEY: MoneyData = {
  booked: BOOKED,
  quotes: QUOTES_OUT,
  owed: { total: MONEY_OWED.total, foot: MONEY_OWED.foot, rowsAt: (now) => owedRows(MONEY_OWED.rows, now) },
};
