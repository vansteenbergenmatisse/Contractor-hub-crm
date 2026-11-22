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
export type BusinessCard = { init: string; name: string; addr: string; phone: string; email: string; site: string; hours: string };

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
