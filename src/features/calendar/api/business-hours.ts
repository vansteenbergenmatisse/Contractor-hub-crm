// The client's hours, read from the one text line the app holds (`business_hours`, or the line built
// from the structured values). Strict on purpose: a line that is not fully understood gives null, so
// no time is ever offered from a guess.
export type DayHours = { open: number; close: number };
// Sunday (0) to Saturday (6). Null: closed, or the line does not state this day.
export type WeekHours = readonly (DayHours | null)[];

const DAY_NAMES: ReadonlyArray<readonly [string, number]> = [
  ["sunday", 0], ["sun", 0], ["monday", 1], ["mon", 1], ["tuesday", 2], ["tues", 2], ["tue", 2], ["wednesday", 3], ["wed", 3],
  ["thursday", 4], ["thurs", 4], ["thur", 4], ["thu", 4], ["friday", 5], ["fri", 5], ["saturday", 6], ["sat", 6],
];
const DAY_INDEX = new Map(DAY_NAMES);
const DAY = DAY_NAMES.map(([name]) => name).join("|");
const TIME = String.raw`\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?`;
const SEGMENT = new RegExp(String.raw`^(${DAY})\b(?:\s*(?:-|to)\s*(${DAY})\b)?\s*:?\s*(?:(closed)|(${TIME})\s*(?:-|to)\s*(${TIME}))$`, "i");

// Minutes after midnight. A time with no AM or PM must be a full 24-hour "HH:MM".
function minutes(raw: string): number | null {
  const value = raw.trim();
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m\.?)?$/i.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (minute > 59) return null;
  const half = match[3]?.toLowerCase();
  if (!half) return /^\d{2}:\d{2}$/.test(value) && hour < 24 ? hour * 60 + minute : null;
  if (hour < 1 || hour > 12) return null;
  return ((hour % 12) + (half === "p" ? 12 : 0)) * 60 + minute;
}

export function parseBusinessHours(text: string | null | undefined): WeekHours | null {
  const line = text?.replace(/[‒-―]/g, "-").trim();
  if (!line) return null;
  const week: (DayHours | null)[] = [null, null, null, null, null, null, null];
  const seen = new Set<number>();
  for (const part of line.split(/[,;\n]+/)) {
    const match = SEGMENT.exec(part.trim());
    if (!match) return null;
    const first = DAY_INDEX.get(match[1].toLowerCase()) as number;
    const last = match[2] ? (DAY_INDEX.get(match[2].toLowerCase()) as number) : first;
    let hours: DayHours | null = null;
    if (!match[3]) {
      const open = minutes(match[4]);
      const close = minutes(match[5]);
      if (open === null || close === null || close <= open) return null;
      hours = { open, close };
    }
    for (let k = 0; k <= (last - first + 7) % 7; k += 1) {
      const day = (first + k) % 7;
      // The same day stated twice cannot be trusted.
      if (seen.has(day)) return null;
      seen.add(day);
      week[day] = hours;
    }
  }
  return week;
}
