import type { Placement, StopKind } from "../types";
import { GRID_ROWS } from "./dates";

// Length of a new stop in half hours: an estimate visit is 1 hour, a job day is 6 hours.
export const NEW_LEN: Record<StopKind, number> = { E: 2, J: 12 };

// Proposal, not a business rule: the start times offered first (half hours from 7:00 AM), and no
// Sundays (the design offers none and the business hours read Mon - Sat). Phase 3 replaces this
// with the real business hours and the connected calendar's busy times.
export const CANDIDATE_STARTS: Record<StopKind, readonly number[]> = { E: [4, 8, 12, 16, 18], J: [2, 4] };
const SEARCH_DAYS = 14;
const FIRST_MINUTE = 7 * 60;

type Busy = { id: string; week: number; day: number; start: number; len: number };

// Up to `count` free times, one per day, starting today (only times still ahead) and looking
// two weeks out. `ignoreId` is a stop that is being moved (its own slot does not block it) and
// `avoid` is the place it already is (never offered again).
export function freeTimes(opts: {
  stops: readonly Busy[];
  kind: StopKind;
  len?: number;
  now: Date;
  ignoreId?: string;
  avoid?: Placement;
  count?: number;
}): Placement[] {
  const { stops, kind, now, ignoreId, avoid } = opts;
  const len = opts.len ?? NEW_LEN[kind];
  const count = opts.count ?? 3;
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const out: Placement[] = [];
  for (let k = 0; k <= SEARCH_DAYS && out.length < count; k += 1) {
    const abs = now.getDay() + k;
    const week = Math.floor(abs / 7);
    const day = abs % 7;
    if (day === 0) continue;
    for (const start of CANDIDATE_STARTS[kind]) {
      if (start + len > GRID_ROWS) continue;
      if (k === 0 && FIRST_MINUTE + start * 30 <= nowMinute) continue;
      if (avoid && avoid.week === week && avoid.day === day && avoid.start === start) continue;
      const clash = stops.some((s) => s.id !== ignoreId && s.week === week && s.day === day && s.start < start + len && start < s.start + s.len);
      if (clash) continue;
      out.push({ week, day, start });
      break;
    }
  }
  return out;
}
