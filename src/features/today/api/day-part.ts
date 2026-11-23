export type DayPart = "Morning" | "Afternoon" | "Evening";

// The word for this moment in the client's time zone. Null when the zone cannot be read.
export function dayPartWord(at: Date, timeZone: string): DayPart | null {
  let hour: number;
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" })
      .formatToParts(at)
      .find((item) => item.type === "hour");
    hour = Number(part?.value);
  } catch {
    return null;
  }
  if (!Number.isInteger(hour)) return null;
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  return "Evening";
}
