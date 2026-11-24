import { describe, expect, it } from "vitest";
import { parseBusinessHours } from "@/features/calendar";

describe("parseBusinessHours: a range with AM or PM on one side only", () => {
  it.each([
    "Mon: 01:00 - 05:00 PM",
    "Mon - Fri: 05:00 - 09:00 PM",
    "Mon: 09:00 AM - 17:00",
    "Mon: 01:00 to 05:00 p.m.",
  ])("refuses %s", (line) => {
    expect(parseBusinessHours(line)).toBeNull();
  });

  it("still reads a range that is 24-hour on both sides", () => {
    expect(parseBusinessHours("Mon: 08:00 - 17:00")?.[1]).toEqual({ open: 480, close: 1020 });
  });

  it("still reads a range with AM or PM on both sides", () => {
    expect(parseBusinessHours("Mon: 01:00 PM - 05:00 PM")?.[1]).toEqual({ open: 780, close: 1020 });
  });
});
