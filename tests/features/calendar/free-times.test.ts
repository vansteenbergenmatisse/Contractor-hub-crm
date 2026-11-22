import { describe, expect, it } from "vitest";
import { freeTimes, GRID_ROWS, liveStops, initialState, MOCK_STOPS } from "@/features/calendar";

const NOW = new Date(2026, 10, 20, 10, 0); // Friday
const SAT = new Date(2026, 10, 21, 8, 0);
const busy = (state = initialState(MOCK_STOPS, NOW)) => liveStops(state).map((s) => ({ ...s, ...s.place }));

describe("free time picking", () => {
  it("offers three times, one per day, none on a booked slot, none on a Sunday", () => {
    const out = freeTimes({ stops: busy(), kind: "E", now: NOW });
    expect(out).toEqual([
      { week: 0, day: 6, start: 4 },
      { week: 1, day: 1, start: 16 },
      { week: 1, day: 2, start: 18 },
    ]);
    expect(new Set(out.map((p) => `${p.week}-${p.day}`)).size).toBe(3);
    expect(out.every((p) => p.day !== 0)).toBe(true);
  });

  it("starts today only with a time that is still ahead", () => {
    const out = freeTimes({ stops: [], kind: "E", now: NOW, count: 1 });
    expect(out).toEqual([{ week: 0, day: 5, start: 8 }]); // 9:00 AM is behind 10:00, 11:00 is ahead
    const late = freeTimes({ stops: [], kind: "E", now: new Date(2026, 10, 20, 17, 0), count: 1 });
    expect(late[0]).toEqual({ week: 0, day: 6, start: 4 });
  });

  it("looks into the next week and does not stop at a week edge", () => {
    const out = freeTimes({ stops: [], kind: "E", now: new Date(2026, 10, 21, 8, 0), count: 3 }); // Saturday
    expect(out.map((p) => p.week)).toEqual([0, 1, 1]);
  });

  it("gives a job a long free stretch", () => {
    const out = freeTimes({ stops: busy(), kind: "J", now: NOW });
    expect(out[0]).toEqual({ week: 0, day: 6, start: 2 });
    for (const p of out) expect(p.start + 12).toBeLessThanOrEqual(22);
  });

  it("never offers a slot that overlaps a stop, even partly", () => {
    const stops = [{ id: "a", week: 0, day: 6, start: 3, len: 2 }];
    const out = freeTimes({ stops, kind: "E", now: SAT, count: 1 });
    expect(out[0]).toEqual({ week: 0, day: 6, start: 8 }); // 9:00 would overlap 8:30 to 9:30
  });

  it("lets a moving stop use its own slot, but never offers the place it is in", () => {
    const stops = [{ id: "a", week: 0, day: 6, start: 4, len: 2 }];
    expect(freeTimes({ stops, kind: "E", now: SAT, count: 1 })[0]).not.toEqual({ week: 0, day: 6, start: 4 });
    expect(freeTimes({ stops, kind: "E", now: SAT, count: 1, ignoreId: "a" })[0]).toEqual({ week: 0, day: 6, start: 4 });
    expect(freeTimes({ stops, kind: "E", now: SAT, count: 1, ignoreId: "a", avoid: { week: 0, day: 6, start: 4 } })[0]).not.toEqual({ week: 0, day: 6, start: 4 });
  });

  it("returns fewer than asked, or none, when nothing is free", () => {
    const wall = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, week: Math.floor((5 + i) / 7), day: (5 + i) % 7, start: 0, len: 22 }));
    expect(freeTimes({ stops: wall, kind: "E", now: NOW })).toEqual([]);
  });
});

describe("free time edges", () => {
  it("looks two weeks out: with the next 8 days fully booked it still finds a time more than 7 days away", () => {
    const wall = Array.from({ length: 8 }, (_, k) => ({ id: `w${k}`, week: Math.floor((5 + k) / 7), day: (5 + k) % 7, start: 0, len: 22 }));
    const out = freeTimes({ stops: wall, kind: "E", now: NOW, count: 1 });
    expect(out).toEqual([{ week: 1, day: 6, start: 4 }]); // 8 days after Friday Nov 20
  });

  it("never offers a slot that starts exactly now", () => {
    const nine = new Date(2026, 10, 20, 9, 0); // Friday 9:00 AM = start 4
    expect(freeTimes({ stops: [], kind: "E", now: nine, count: 1 })).toEqual([{ week: 0, day: 5, start: 8 }]);
    const early = new Date(2026, 10, 20, 8, 59);
    expect(freeTimes({ stops: [], kind: "E", now: early, count: 1 })).toEqual([{ week: 0, day: 5, start: 4 }]);
  });

  it("never offers a time that runs past the end of the grid (6:00 PM)", () => {
    for (const kind of ["E", "J"] as const) {
      expect(freeTimes({ stops: [], kind, len: 21, now: NOW })).toEqual([]);
      expect(freeTimes({ stops: [], kind, len: GRID_ROWS + 1, now: NOW })).toEqual([]);
    }
    // A stop that exactly fills the grid from 8:00 AM still fits.
    const full = freeTimes({ stops: [], kind: "J", len: 20, now: NOW });
    expect(full).toEqual([{ week: 0, day: 6, start: 2 }, { week: 1, day: 1, start: 2 }, { week: 1, day: 2, start: 2 }]);
    expect(full.every((p) => p.start + 20 <= GRID_ROWS)).toBe(true);
  });
});
