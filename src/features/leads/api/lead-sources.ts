import type { Lead, LeadOrigin, SourceKey, SourcePeriod } from "../types";
import { isThisWeek, sourceKey } from "./leads-logic";

export const ORIGIN_LABEL: Record<LeadOrigin, string> = {
  call: "Call", text: "Text", email: "Email", website: "Website form", fb: "Facebook", ig: "Instagram",
  gmb: "Google My Business", bing: "Bing Places", gads: "Google Ads", you: "Added by you", unknown: "Unknown",
};
export const ORIGIN_ORDER: readonly LeadOrigin[] = ["call", "text", "email", "website", "fb", "ig", "gmb", "bing", "gads", "you", "unknown"];
// What the owner can pick on the form. Unknown is never a choice.
export const ORIGIN_CHOICES: readonly LeadOrigin[] = ORIGIN_ORDER.filter((key) => key !== "unknown");
export const DEFAULT_ORIGIN: LeadOrigin = "you";

const FROM_KEY: Record<SourceKey, LeadOrigin> = { call: "call", form: "website", text: "text", gmb: "gmb", fb: "fb", ig: "ig" };
// Exact values only, beyond the ones `sourceKey` knows. Anything else stays Unknown.
const EXTRA: Readonly<Record<string, LeadOrigin>> = {
  email: "email", "e-mail": "email", "bing places": "bing", "google ads": "gads", "added by you": "you",
};

export function extraOrigin(value: string | null | undefined): LeadOrigin | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return Object.hasOwn(EXTRA, key) ? EXTRA[key] : null;
}

// The channel of a raw HighLevel source value. Never a guess.
export function originFromRaw(value: string | null | undefined): LeadOrigin {
  const key = sourceKey(value);
  return extraOrigin(value) ?? (key ? FROM_KEY[key] : "unknown");
}

export function originOf(lead: Lead): LeadOrigin {
  return lead.origin ?? (lead.source ? FROM_KEY[lead.source] : "unknown");
}

export function isOrigin(value: unknown): value is LeadOrigin {
  return typeof value === "string" && Object.hasOwn(ORIGIN_LABEL, value);
}

const dayKey = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);

// Whether a moment falls in the period, in the location's zone. A week starts on Sunday.
export function inPeriod(ms: number, period: SourcePeriod, loadedAt: string, timeZone: string): boolean {
  const now = Date.parse(loadedAt);
  if (Number.isNaN(ms) || Number.isNaN(now) || ms > now) return false;
  if (period === "all") return true;
  if (period === "week") return isThisWeek(ms, loadedAt, timeZone);
  const at = dayKey(ms, timeZone);
  const today = dayKey(now, timeZone);
  return period === "today" ? at === today : at.slice(0, 7) === today.slice(0, 7);
}

export type SourceBreakdown = {
  rows: Array<{ key: LeadOrigin; label: string; count: number; width: number }>;
  total: number;
  // False: contacts beyond the loaded page could fall in this period, so the numbers are a floor.
  proven: boolean;
  loaded: number;
};

type Context = { loadedAt: string; timeZone: string; complete: boolean; dropped: number };

// `added`: hand-added leads per channel. A plain number counts them all as Added by you.
export function sourceBreakdown(leads: readonly Lead[], added: number | Partial<Record<LeadOrigin, number>>, period: SourcePeriod, context: Context): SourceBreakdown {
  const { loadedAt, timeZone, complete, dropped } = context;
  const counts = Object.fromEntries(ORIGIN_ORDER.map((key) => [key, 0])) as Record<LeadOrigin, number>;
  const times = leads.map((l) => (l.receivedAt ? Date.parse(l.receivedAt) : Number.NaN));
  leads.forEach((lead, i) => {
    if (inPeriod(times[i], period, loadedAt, timeZone)) counts[originOf(lead)] += 1;
  });
  if (typeof added === "number") counts.you += added;
  else for (const key of ORIGIN_ORDER) counts[key] += added[key] ?? 0;
  const dated = times.every((t) => !Number.isNaN(t));
  const oldest = dated && times.length ? Math.min(...times) : null;
  const reachesPast = period !== "all" && oldest !== null && !inPeriod(oldest, period, loadedAt, timeZone);
  const proven = dropped === 0 && dated && (complete || reachesPast);
  return {
    rows: ORIGIN_ORDER.map((key) => ({ key, label: ORIGIN_LABEL[key], count: counts[key], width: Math.min(100, 25 * counts[key]) })),
    total: ORIGIN_ORDER.reduce((n, key) => n + counts[key], 0),
    proven,
    loaded: leads.length,
  };
}
