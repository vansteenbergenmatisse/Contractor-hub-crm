import { describe, expect, it } from "vitest";
import { dayAria, dayDate, dayLong, dayShort, fromDayIndex, isPast, isToday, nowPosition, slotLabel, stopEnd, toDayIndex, weekRangeLabel } from "@/features/calendar";

// Friday 20 Nov 2026, 10:00 (local time).
const NOW = new Date(2026, 10, 20, 10, 0);

describe("week arithmetic", () => {
  it("counts weeks from the Sunday of the week that holds now", () => {
    expect(dayDate(NOW, 0, 0).getDate()).toBe(15);
    expect(dayDate(NOW, 0, 5).getDate()).toBe(20);
    expect(dayDate(NOW, 1, 0).getDate()).toBe(22);
    expect(dayDate(NOW, -1, 0).getDate()).toBe(8);
  });

  it("crosses a month and a year", () => {
    expect(weekRangeLabel(NOW, 0)).toBe("Nov 15 – 21, 2026");
    expect(weekRangeLabel(NOW, 2)).toBe("Nov 29 – Dec 5, 2026");
    expect(weekRangeLabel(new Date(2026, 11, 30), 0)).toBe("Dec 27 – Jan 2, 2027");
  });

  it("has no first or last week", () => {
    expect(dayDate(NOW, 52, 0).getFullYear()).toBe(2027);
    expect(dayDate(NOW, -52, 0).getFullYear()).toBe(2025);
  });

  it("marks today only in this week", () => {
    expect(isToday(NOW, 0, 5)).toBe(true);
    expect(isToday(NOW, 0, 4)).toBe(false);
    expect(isToday(NOW, 1, 5)).toBe(false);
  });

  it("turns a day position into week and day and back, also below zero", () => {
    expect(fromDayIndex(7)).toEqual({ wk: 1, sd: 0 });
    expect(fromDayIndex(-1)).toEqual({ wk: -1, sd: 6 });
    expect(fromDayIndex(-8)).toEqual({ wk: -2, sd: 6 });
    for (const k of [-15, -7, -1, 0, 6, 7, 20]) {
      const { wk, sd } = fromDayIndex(k);
      expect(toDayIndex(wk, sd)).toBe(k);
    }
  });
});

describe("labels", () => {
  it("formats half hour slots from 7:00 AM", () => {
    expect(slotLabel(0)).toBe("7:00 AM");
    expect(slotLabel(1)).toBe("7:30 AM");
    expect(slotLabel(10)).toBe("12:00 PM");
    expect(slotLabel(11)).toBe("12:30 PM");
    expect(slotLabel(22)).toBe("6:00 PM");
  });

  it("formats days", () => {
    expect(dayShort(NOW, 0, 5)).toBe("Fri, Nov 20");
    expect(dayLong(NOW, 0, 5)).toBe("Friday, Nov 20");
    expect(dayAria(NOW, 0, 5, 2)).toBe("Friday, November 20, 2 stops");
    expect(dayAria(NOW, 0, 5, 1)).toBe("Friday, November 20, 1 stop");
    expect(dayAria(NOW, 0, 6, 0)).toBe("Saturday, November 21, nothing booked");
  });
});

describe("now line", () => {
  it("sits on the row and column of the current time", () => {
    expect(nowPosition(NOW)).toEqual({ day: 5, row: 7, column: 7, label: "10:00" });
    expect(nowPosition(new Date(2026, 10, 20, 15, 45))?.row).toBe(18);
  });

  it("is hidden before 7:00 AM and from 6:00 PM", () => {
    expect(nowPosition(new Date(2026, 10, 20, 6, 59))).toBeNull();
    expect(nowPosition(new Date(2026, 10, 20, 7, 0))?.row).toBe(1);
    expect(nowPosition(new Date(2026, 10, 20, 17, 59))?.row).toBe(22);
    expect(nowPosition(new Date(2026, 10, 20, 18, 0))).toBeNull();
  });
});

describe("what is over", () => {
  it("is over once it has ended, not while it runs", () => {
    expect(isPast(NOW, { week: 0, day: 5, start: 3 }, 2)).toBe(true); // 8:30 to 9:30
    expect(isPast(NOW, { week: 0, day: 5, start: 5 }, 2)).toBe(false); // 9:30 to 10:30, in progress
    expect(isPast(NOW, { week: 0, day: 5, start: 6 }, 2)).toBe(false);
    expect(isPast(NOW, { week: -1, day: 6, start: 20 }, 2)).toBe(true);
    expect(isPast(NOW, { week: 1, day: 0, start: 0 }, 1)).toBe(false);
  });

  it("ends exactly at start plus length", () => {
    expect(stopEnd(NOW, { week: 0, day: 5, start: 6 }, 2).getHours()).toBe(11);
    expect(isPast(NOW, { week: 0, day: 5, start: 4 }, 2)).toBe(true); // ends at 10:00 sharp, so it is over
  });
});
