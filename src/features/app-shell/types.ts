// Types shared inside the app-shell feature.
export type PageKey =
  | "today" | "inbox" | "calendar" | "pipeline" | "leads"
  | "quotes" | "invoices" | "payments" | "automations" | "settings";

// Who the app is for, from the sub-account's custom values. Text fields are "" when HighLevel has no
// value (never a made-up one); links are https URLs or null.
export type Business = {
  name: string;
  init: string;
  tag: string;
  owner: string;
  ownerInit: string;
  first: string;
  logoUrl: string | null;
  keyword: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  county: string;
  state: string;
  hours: string;
  websiteUrl: string | null;
  // The website without https and www, for links in texts ("example.com"), or "".
  site: string;
  cta: string;
  bookingJobUrl: string | null;
  bookingQuoteUrl: string | null;
  googleProfileUrl: string | null;
  googleReviewUrl: string | null;
  // Custom values `seasonal_offer_text` and `referral_reward_text`, or "".
  seasonalOffer: string;
  referralReward: string;
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
