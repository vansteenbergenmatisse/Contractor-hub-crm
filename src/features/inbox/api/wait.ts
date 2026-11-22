import type { Filter, WaitTier } from "../types";

// Under 1 hour amber, 1 hour to under 24 hours light red, 24 hours or more full red.
// Boundaries: 59 is warn, 60 is bad, 1439 is bad, 1440 is hot.
export function waitTier(minutes: number): WaitTier {
  if (minutes >= 1440) return "hot";
  if (minutes >= 60) return "bad";
  return "warn";
}

// The wait in words, from minutes: 14 min, 1 hr, 5 hrs, 1 day, 2 days.
export function waitText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    return `${hours} ${hours === 1 ? "hr" : "hrs"}`;
  }
  const days = Math.floor(minutes / 1440);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function waitLabel(minutes: number): string {
  return `Waiting ${waitText(minutes)}`;
}

export function waitLevelClass(minutes: number): string {
  return `is-${waitTier(minutes)}`;
}

export const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "warn", label: "Under 1 Hr" },
  { key: "bad", label: "1–24 Hrs" },
  { key: "hot", label: "24+ Hrs" },
];
