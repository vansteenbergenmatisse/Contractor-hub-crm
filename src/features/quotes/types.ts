// Types shared inside the quotes feature.
import type { Reason } from "@/features/app-shell";

// need: waits for a service and a price. ready: built, waits for the owner's OK. sent: marked sent.
// won / lost / later: the owner's answer after the quote went out.
export type QuoteStatus = "need" | "ready" | "sent" | "won" | "lost" | "later";

export type QuoteLine = { text: string; amount: number };

export type Quote = {
  id: string;
  name: string;
  service: string;
  status: QuoteStatus;
  // The status the quote started in on this screen. Tells "moved just now" from "was already so".
  baseStatus: QuoteStatus;
  // Free text from the sample data for a sent quote (for example "Day 6. Asked for a lower price.").
  note: string;
  // How often the customer opened the quote. Real data comes from the estimate status Viewed (Phase 3).
  opens: number;
  lines: QuoteLine[];
  // Top of a price range. Absent for a single price. The low end is the sum of the lines.
  high?: number;
  // Name of the owner's own quote file. Only the name is kept; nothing is read or uploaded.
  file?: string;
  // Reason picked when the quote was marked lost.
  why?: Exclude<Reason, "later">;
};

export type QuoteFilter = "all" | "ready" | "sent";

export type QuotesState = {
  quotes: Quote[];
  selectedId: string;
  // Phone: the sheet is the whole screen (a pushed detail).
  doc: boolean;
  editing: boolean;
  filter: QuoteFilter;
  // The one change that can be undone.
  last: { id: string; prev: QuoteStatus } | null;
};

export type QuotesAction =
  | { type: "filter"; filter: QuoteFilter }
  | { type: "see"; id: string }
  | { type: "select"; id: string }
  | { type: "shut" }
  | { type: "build"; id: string; service: string; low: number; high?: number; lines: QuoteLine[] }
  | { type: "attach"; id: string; file: string }
  | { type: "detach"; id: string }
  | { type: "sent"; id: string }
  | { type: "move"; id: string; to: "won" | "lost" | "later"; why?: Exclude<Reason, "later"> }
  | { type: "undo" }
  | { type: "edit-start" }
  | { type: "edit-cancel" }
  | { type: "edit-save"; id: string; name: string; lines: QuoteLine[] };

export type PriceParse = { ok: true; low: number; high?: number } | { ok: false };
export type BuildCheck = { ok: true; service: string; low: number; high?: number } | { ok: false; errors: { service: string; price: string }; field: "service" | "price" };
export type EditDraft = { name: string; lines: ReadonlyArray<{ text: string; amount: string }> };
export type EditCheck = { ok: true; name: string; lines: QuoteLine[] } | { ok: false; message: string; field: string };
