import type { SearchRow, SendTimerRequest } from "@/features/app-shell";
import { buildMockInvoices, chipFor } from "@/features/invoices";
import { LEADS, MONEY_OWED, QUOTES_OUT } from "../mock";
import type { Lead, LeadRange, MiniRow, OwedRow, RowStatus, Stop, Todo, TodayState } from "../types";

const NBSP = " ";

export const openCount = (state: TodayState, todos: readonly Todo[]): number =>
  todos.filter((t) => (state.status[t.id] ?? 0) === 0).length;

// "6 things need you today." / "1 thing needs you today." / "All done for today."
export function greeting(left: number): { count: string; tail: string } {
  if (left === 0) return { count: `All${NBSP}done`, tail: "for today." };
  return { count: `${left}${NBSP}${left === 1 ? "thing" : "things"}`, tail: left === 1 ? "needs you today." : "need you today." };
}

// The first open to-do from the top, over all to-dos (the filter does not change which one is next).
export const nextTodo = (state: TodayState, todos: readonly Todo[]): Todo | undefined =>
  todos.find((t) => (state.status[t.id] ?? 0) === 0);

export const nextLabel = (todo: Todo | undefined): string => (todo ? `Next: ${todo.primary.label} · ${todo.name}` : "");

export function rowClass(state: TodayState, todos: readonly Todo[], todo: Todo): string {
  const status = state.status[todo.id] ?? 0;
  const next = nextTodo(state, todos);
  const parts = ["fd-row"];
  if (todo.secondary) parts.push("is-two");
  if (status) parts.push("is-done");
  if (next?.id === todo.id) parts.push("is-next");
  if (state.ev === `row:${todo.id}`) parts.push("is-last");
  if (todo.send && status === 1) parts.push("is-nou");
  if (state.filter !== "all" && state.filter !== todo.kind) parts.push("is-off");
  return parts.join(" ");
}

// "What the system does next" line for a done row.
export const doneText = (state: TodayState, todo: Todo): string => todo.done[state.status[todo.id] === 2 ? 1 : 0] ?? todo.done[0];

// "fd-num" with a tick animation class that alternates so the count animates on every press of a row.
export function numClass(state: TodayState): string {
  if (!state.ev.startsWith("row:")) return "fd-num";
  return `fd-num ${state.bumps % 2 ? "fd-tick-a" : "fd-tick-b"}`;
}

// The answer chip on a past calendar stop (shows once its visit is answered).
export function visitChip(state: TodayState, stop: Stop): { className: string; text: string } | null {
  if (!stop.visitOf) return null;
  const status = state.status[stop.visitOf] ?? 0;
  return {
    className: `fd-chip is-plain${status ? "" : " is-off"}${status && state.ev === `row:${stop.visitOf}` ? " is-pop" : ""}`,
    text: status === 2 ? "No-show" : "Done",
  };
}

export const leadsFor = (range: LeadRange): readonly Lead[] => (range === "today" ? LEADS.filter((l) => l.ago) : LEADS);

export const leadMeta = (lead: Lead, range: LeadRange): string => `${lead.need} · ${range === "today" ? lead.ago : lead.day}`;

export const nextStop = (stops: readonly Stop[]): Stop | undefined => stops.find((s) => s.when === "next");

export const mapsUrl = (address: string): string => `https://maps.google.com/?q=${encodeURIComponent(address)}`;

// Only the primary answer of a send row opens the timer. "Yes, paid" sends nothing.
export const pressPlan = (todo: Todo, value: RowStatus): "send" | "set" => (todo.send && value === 1 ? "send" : "set");

// The document the 20-second timer shows. Phase 2: built from the to-do's own service and amount.
export function sendRequest(todo: Todo, onDone: () => void): SendTimerRequest | null {
  if (!todo.send) return null;
  const service = todo.detail.split(" · ")[0];
  return {
    kind: todo.send,
    name: todo.name,
    total: todo.amount,
    doc: { title: todo.send, name: todo.name, sub: service, amount: todo.amount, lines: [[service, todo.amount]] },
    onDone,
  };
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Rows the shell search can find (mock until Phase 3): the leads, the quotes out, the money owed.
export const searchRows: readonly SearchRow[] = [
  ...LEADS.map((l): SearchRow => ({ id: `today-lead-${slug(l.name)}`, page: "leads", name: l.name, sub: `${l.need} · ${l.chip.text}`, href: "/leads" })),
  ...QUOTES_OUT.rows.map((r): SearchRow => ({ id: `today-quote-${slug(r.name)}`, page: "quotes", name: r.name, sub: `Quote ${r.amount} · ${r.note ?? ""}`.trim(), href: "/quotes" })),
  ...MONEY_OWED.rows.map((r): SearchRow => ({ id: `today-owed-${slug(r.name)}`, page: "payments", name: r.name, sub: `Owes ${r.amount}`, href: "/payments" })),
];

// Money owed rows with the due day or lateness taken from the Invoices page's sample invoices on
// `now`, so both pages say the same ("Due Nov 22" / "6 days late"). A late invoice gets the red chip.
export function owedRows(rows: readonly OwedRow[], now: Date): MiniRow[] {
  const invoices = buildMockInvoices(now);
  return rows.map((r) => {
    const inv = invoices.find((i) => i.no === r.invoiceNo);
    const chip = inv ? chipFor(inv, now) : null;
    const late = !!chip && (chip.tone === "is-bad" || chip.tone === "is-hot");
    return { name: r.name, amount: r.amount, ...(late ? { late: chip.text } : { note: chip?.text ?? "" }) };
  });
}
