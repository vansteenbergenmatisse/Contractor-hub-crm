// Types shared inside the app-shell feature.
export type PageKey =
  | "today" | "inbox" | "calendar" | "pipeline" | "leads"
  | "quotes" | "invoices" | "payments" | "automations" | "settings";

export type Business = {
  name: string;
  init: string;
  tag: string;
  owner: string;
  ownerInit: string;
  first: string;
};

// One row the search can find. `page` decides the group; `href` is where it opens.
export type SearchRow = {
  id: string;
  page: "leads" | "pipeline" | "quotes" | "invoices" | "payments" | "inbox";
  name: string;
  sub: string;
  href: string;
};

// What a send timer shows: the document the customer will get.
export type SendDoc = {
  title: string;
  name: string;
  sub: string;
  amount: string;
  lines: ReadonlyArray<readonly [string, string]>;
  file?: string;
};

export type SendTimerRequest = {
  kind: "Quote" | "Invoice";
  name: string;
  total: string;
  doc: SendDoc;
  // Runs once, after the count reaches 0. Cancel runs nothing.
  onDone: () => void;
};

export const REASONS = ["Ask again later", "Said no", "Chose a competitor", "Not a fit", "Opted out"] as const;
export type Reason = "later" | Exclude<(typeof REASONS)[number], "Ask again later">;

export type ReasonRequest = { name: string; onPick: (reason: Reason) => void };
