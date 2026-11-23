// Types shared inside the invoices feature.

// need = a draft that misses one thing; ready = complete, can go out; sent; paid.
export type InvoiceStatus = "need" | "ready" | "sent" | "paid";
export type MissingField = "price" | "addr" | "name";
export type Filter = "all" | "todo" | "sent" | "paid";

export type Invoice = {
  no: number;
  name: string;
  svc: string;
  amt: number;
  addr: string;
  st: InvoiceStatus;
  // Free note shown on a ready invoice (for example how it was made).
  note: string;
  // True for a change made on this screen in this visit ("Sent just now").
  justNow: boolean;
  // Local calendar days, "YYYY-MM-DD".
  dueOn: string | null;
  paidOn: string | null;
  // Mark paid keeps whether the invoice was "Sent just now", so an Undo brings back the same chip.
  sentJustNow?: boolean;
};

export type Tone = "is-warn" | "is-plain" | "is-ok" | "is-bad" | "is-hot";
export type Chip = { tone: Tone; text: string };

export type Result = { ok: true; invoice: Invoice } | { ok: false; error: string };

export type EditForm = { name: string; addr: string; svc: string; price: string };

// The business facts the sheet shows. They come from the sub-account's custom values.
export type BusinessValues = Partial<
  Record<
    "business_name" | "business_address" | "business_phone_number" | "business_email" | "business_hours" | "business_website_url",
    string
  >
>;
export type BusinessCard = { init: string; name: string; addr: string; phone: string; email: string; site: string; hours: string; logo: string | null };

export type SheetView = {
  title: string;
  due: string;
  name: string;
  addr: string;
  svc: string;
  lineAmount: string;
  total: string;
  chip: Chip;
};

// The kept state of the Invoices page (key "invoices"), shared with Payments and Today.
export type InvoicesKeptState = {
  now: Date;
  invoices: Invoice[];
  sel: number;
  doc: boolean;
  editing: boolean;
  editError: string;
  form: EditForm;
  filter: Filter;
  fixText: Record<number, string>;
  fixError: Record<number, string>;
};
export type InvoicesPatch = Partial<InvoicesKeptState> | ((s: InvoicesKeptState) => Partial<InvoicesKeptState>);

// Real invoices (read-only). The shape the adapter hands over; declared here so this feature does
// not depend on it (the server page injects the reader). A field that was not readable is null.
export type LiveInvoiceRow = {
  id: string;
  status: "draft" | "sent" | "payment_processing" | "paid" | "void" | "partially_paid" | null;
  liveMode: boolean | null;
  name: string | null;
  number: string | null;
  contactName: string | null;
  currency: string | null;
  issueDate: string | null;
  dueDate: string | null;
  total: number | null;
  amountDue: number | null;
  amountPaid: number | null;
};
export type InvoicesRead =
  | { ok: true; rows: LiveInvoiceRow[]; expected: number; dropped: number; complete: boolean }
  | { ok: false; reason: "reconnect" | "unavailable" };
export type InvoicesReader = (tenantId: string) => Promise<InvoicesRead>;
export type DueTotal = { amount: number; currency: string; count: number };
export type DueSummary = { due: LiveInvoiceRow[]; total: DueTotal | null; blocked: boolean };
export type LiveInvoiceView = {
  id: string;
  name: string;
  detail: string;
  statusLabel: string;
  tone: "is-plain" | "is-warn" | "is-ok";
  bucket: "draft" | "sent" | "paid" | "other";
  amountText: string;
  dueText: string | null;
  test: boolean;
};
export type InvoicesResult =
  | { state: "reconnect" | "unavailable" | "empty" }
  | { state: "ready"; rows: LiveInvoiceView[]; total: DueTotal | null; blocked: boolean; complete: boolean };
