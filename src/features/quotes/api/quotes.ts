// Pure quote logic. No React, no network, no storage. Everything here runs on screen against mock data.
import type { SendTimerRequest } from "@/features/app-shell";
import type {
  BuildCheck, EditCheck, EditDraft, PriceParse, Quote, QuoteFilter, QuoteLine, QuotesAction, QuotesState, QuoteStatus,
} from "../types";

export const MAX_LINES = 3;

// $1,234 (whole dollars, like the design). Totals of lines with cents round at display time.
export const formatMoney = (n: number): string => "$" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export const sumLines = (lines: readonly QuoteLine[]): number => lines.reduce((total, line) => total + line.amount, 0);

export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
};

// "950", "$950", "800 to 1,200", "800-1200". A range needs its top above its low end.
export function parsePrice(raw: string): PriceParse {
  const text = raw.replace(/,/g, "").trim();
  const m = /^\$?\s*(\d+(?:\.\d{1,2})?)\s*(?:(?:to|-|–|—)\s*\$?\s*(\d+(?:\.\d{1,2})?))?$/i.exec(text);
  if (!m) return { ok: false };
  const low = Number(m[1]);
  const high = m[2] === undefined ? undefined : Number(m[2]);
  if (!(low > 0)) return { ok: false };
  if (high !== undefined && !(high > low)) return { ok: false };
  return high === undefined ? { ok: true, low } : { ok: true, low, high };
}

// Build quote: the service and a price or a range. The error sits under its field; the cursor goes to the first bad one.
export function checkBuild(serviceRaw: string, priceRaw: string): BuildCheck {
  const service = serviceRaw.trim();
  const price = parsePrice(priceRaw);
  if (service && price.ok) return { ok: true, service, low: price.low, ...(price.high === undefined ? {} : { high: price.high }) };
  return {
    ok: false,
    field: service ? "price" : "service",
    errors: { service: service ? "" : "Say what the service is.", price: price.ok ? "" : "Enter a price or a range in dollars. For example 950." },
  };
}

// Edit on the sheet: the customer name and each line with its price.
export function checkEdit(draft: EditDraft): EditCheck {
  const name = draft.name.trim();
  const lines: QuoteLine[] = [];
  let badField = "";
  draft.lines.forEach((line, k) => {
    const text = line.text.trim();
    const cleaned = line.amount.replace(/[$,\s]/g, "");
    const amount = /^\d+(\.\d{1,2})?$/.test(cleaned) ? Number(cleaned) : NaN;
    if (!badField && (!text || !(amount > 0))) badField = text ? `a${k}` : `t${k}`;
    lines.push({ text, amount });
  });
  if (!name) return { ok: false, field: "name", message: "Enter the customer name." };
  if (badField) return { ok: false, field: badField, message: "Every line needs words and a price in dollars." };
  return { ok: true, name, lines };
}

export const uploadName = (customer: string): string => "quote-" + customer.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".pdf";

// The amount in words: a price, a range, or the owner's own file.
export function amountLabel(q: Quote): string {
  if (q.file && q.lines.length === 0) return "In your file";
  if (q.lines.length === 0) return "No price yet";
  const low = formatMoney(sumLines(q.lines));
  return q.high ? `${low} to ${formatMoney(q.high)}` : low;
}

export const isMoved = (q: Quote): boolean => q.status !== q.baseStatus;

// The words in the status chip.
export function statusText(q: Quote): string {
  switch (q.status) {
    case "need": return "Needs service and price";
    case "won": return "Accepted. Marked on screen only.";
    case "lost": return q.why ? `Lost: ${q.why.toLowerCase()}. Marked on screen only.` : "Lost. Marked on screen only.";
    case "later": return "Ask again later. The card sits in Check Back Later.";
    case "ready": return q.file ? "Your own quote. It waits for your OK." : q.note || "The AI built it. It waits for your OK.";
    case "sent":
      if (isMoved(q)) return "Marked sent just now. Nothing left this app.";
      if (q.opens > 0) return `Opened ${q.opens} ${q.opens === 1 ? "time" : "times"} today. Call now.`;
      return q.note;
  }
}

const CHIP: Record<QuoteStatus, string> = { need: "is-warn", ready: "is-warn", sent: "is-plain", won: "is-ok", lost: "is-plain", later: "is-plain" };
export const chipClass = (q: Quote): string => "fd-chip " + (q.status === "sent" && q.opens > 0 && !isMoved(q) ? "is-warn" : CHIP[q.status]);

// The filter a quote belongs to. A quote that needs a price counts as "to approve".
export const groupOf = (q: Quote): QuoteFilter | "other" => (q.status === "need" || q.status === "ready" ? "ready" : q.status === "sent" ? "sent" : "other");
export const isVisible = (q: Quote, filter: QuoteFilter): boolean => filter === "all" || groupOf(q) === filter;

export function filterCounts(quotes: readonly Quote[]): Record<QuoteFilter, number> {
  return { all: quotes.length, ready: quotes.filter((q) => groupOf(q) === "ready").length, sent: quotes.filter((q) => groupOf(q) === "sent").length };
}

// The two money tiles. A range counts at its low end.
export function totals(quotes: readonly Quote[]) {
  const sum = (status: QuoteStatus) => quotes.filter((q) => q.status === status);
  const ready = sum("ready"), out = sum("sent");
  return {
    ready: formatMoney(sumLines(ready.flatMap((q) => q.lines))),
    readyLabel: `${ready.length} ${ready.length === 1 ? "waits" : "wait"} for your OK`,
    out: formatMoney(sumLines(out.flatMap((q) => q.lines))),
    outLabel: `${out.length} out with customers`,
  };
}

// The first quote that waits for an OK carries the one filled button on the list.
export const firstReadyId = (quotes: readonly Quote[]): string | undefined => quotes.find((q) => q.status === "ready")?.id;

export const canApprove = (q: Quote): boolean => q.status === "ready";
export const canEdit = (q: Quote): boolean => (q.status === "ready" || q.status === "sent") && !q.file;
export const canUpload = (q: Quote): boolean => (q.status === "need" || q.status === "ready") && !q.file;

// What the 20 second send timer shows. Phase 2: nothing is sent; onDone only marks the quote Sent on screen.
export function sendRequest(q: Quote, onDone: () => void): SendTimerRequest {
  const amount = amountLabel(q);
  return {
    kind: "Quote",
    name: q.name,
    total: q.file && q.lines.length === 0 ? "your own file" : amount,
    doc: {
      title: "Quote",
      name: q.name,
      sub: q.service,
      amount,
      lines: q.file ? [] : q.lines.map((line) => [line.text, q.high ? amount : formatMoney(line.amount)] as const),
      ...(q.file ? { file: q.file } : {}),
    },
    onDone,
  };
}

const patch = (state: QuotesState, id: string, change: (q: Quote) => Quote): Quote[] => state.quotes.map((q) => (q.id === id ? change(q) : q));
const find = (state: QuotesState, id: string) => state.quotes.find((q) => q.id === id);

export const initialState = (quotes: readonly Quote[]): QuotesState => ({
  quotes: quotes.map((q) => ({ ...q, lines: q.lines.map((l) => ({ ...l })) })),
  selectedId: quotes[0]?.id ?? "",
  doc: false,
  editing: false,
  filter: "all",
  last: null,
});

export function quotesReducer(state: QuotesState, action: QuotesAction): QuotesState {
  switch (action.type) {
    case "filter": return { ...state, filter: action.filter };
    case "see": return { ...state, selectedId: action.id, doc: true, editing: false };
    case "shut": return { ...state, doc: false, editing: false };
    case "build": {
      const q = find(state, action.id);
      if (!q || q.status !== "need") return state;
      const { file: _file, ...rest } = q;
      void _file;
      const next: Quote = { ...rest, status: "ready", service: action.service, lines: action.lines, ...(action.high ? { high: action.high } : {}) };
      return { ...state, quotes: patch(state, q.id, () => next), selectedId: q.id, last: null };
    }
    case "attach": {
      const q = find(state, action.id);
      if (!q || !canUpload(q)) return state;
      return { ...state, quotes: patch(state, q.id, (x) => ({ ...x, file: action.file, status: x.status === "need" ? "ready" : x.status })), selectedId: q.id, editing: false, last: null };
    }
    case "detach": {
      const q = find(state, action.id);
      if (!q || !q.file) return state;
      return { ...state, quotes: patch(state, q.id, (x) => { const { file: _f, ...rest } = x; void _f; return { ...rest, status: x.lines.length ? x.status : "need" }; }) };
    }
    case "sent": {
      const q = find(state, action.id);
      if (!q || q.status !== "ready") return state;
      return { ...state, quotes: patch(state, q.id, (x) => ({ ...x, status: "sent" })), selectedId: q.id, editing: false, last: null };
    }
    case "move": {
      const q = find(state, action.id);
      if (!q || q.status !== "sent") return state;
      const why = action.to === "lost" ? action.why : undefined;
      return { ...state, quotes: patch(state, q.id, (x) => { const { why: _w, ...rest } = x; void _w; return { ...rest, status: action.to, ...(why ? { why } : {}) }; }), selectedId: q.id, editing: false, last: { id: q.id, prev: q.status } };
    }
    case "undo": {
      if (!state.last) return state;
      const { id, prev } = state.last;
      return { ...state, quotes: patch(state, id, (x) => { const { why: _w, ...rest } = x; void _w; return { ...rest, status: prev }; }), last: null };
    }
    case "edit-start": {
      const q = find(state, state.selectedId);
      return q && canEdit(q) ? { ...state, editing: true } : state;
    }
    case "edit-cancel": return { ...state, editing: false };
    case "edit-save": {
      const q = find(state, action.id);
      if (!q) return state;
      return { ...state, quotes: patch(state, q.id, (x) => { const { high: _h, ...rest } = x; void _h; return { ...rest, name: action.name, lines: action.lines }; }), editing: false };
    }
  }
}
