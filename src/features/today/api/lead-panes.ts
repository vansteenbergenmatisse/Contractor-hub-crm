import { createInitialState, isThisWeek, tiles, withReceived, type Lead, type LeadsResult } from "@/features/leads";
import type { LeadRange } from "../types";

export type LeadPane = { rows: readonly Lead[]; count: number | null };
type Ready = Extract<LeadsResult, { state: "ready" }>;

const dayKey = (ms: number, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);

// The counts Leads shows for the same data. Null: the loaded page cannot prove the number.
export function leadCounts(result: Ready, timeZone: string): { today: number | null; week: number | null } {
  const { today, week } = tiles(result.leads, createInitialState(result.leads), { loadedAt: result.loadedAt, complete: result.complete, timeZone, dropped: result.dropped });
  return { today, week };
}

// The rows and proven count of each range, with the received time in the viewer's time zone.
export function leadPanes(result: Ready, timeZone: string): Record<LeadRange, LeadPane> {
  const now = Date.parse(result.loadedAt);
  const todayKey = dayKey(now, timeZone);
  const rows = withReceived(result.leads, result.loadedAt, timeZone);
  const at = (lead: Lead) => Date.parse(lead.receivedAt ?? "");
  const counts = leadCounts(result, timeZone);
  return {
    today: { rows: rows.filter((l) => !Number.isNaN(at(l)) && dayKey(at(l), timeZone) === todayKey), count: counts.today },
    week: { rows: rows.filter((l) => isThisWeek(at(l), result.loadedAt, timeZone)), count: counts.week },
  };
}

export const initials = (name: string): string =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
