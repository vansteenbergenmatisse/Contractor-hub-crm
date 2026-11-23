// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CalendarResult, CalendarWeekInfo, LiveStop } from "@/features/calendar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AppointmentsTile, Greeting, TodayCalendarCard, dayPartWord } from "@/features/today";
import { chunkLabel, chunkSpan } from "@/features/pipeline";

// All values are fake.
const week: CalendarWeekInfo = { timeZone: "UTC", weekStart: "2026-03-01", prevWeek: "2026-02-22", nextWeek: "2026-03-08", todayDay: 3, rangeLabel: "", days: [] };
const stop = (id: string, day: number, past = false): LiveStop => ({
  id, eventId: id, day, start: 0, len: 1, lane: 0, lanes: 1, name: `Stop ${id}`, service: "", address: "1 Test St",
  statusLabel: "Confirmed", startLabel: "9:00 AM", endLabel: "10:00 AM", past,
});
const ready = (stops: LiveStop[], over: Partial<Extract<CalendarResult, { state: "ready" }>> = {}): CalendarResult => ({
  state: "ready", week, stops, loadedAt: "2026-03-04T12:00:00.000Z", complete: true, dropped: 0, ...over,
});
const empty: CalendarResult = { state: "empty", week, reason: "no-appointments" };

describe("the greeting follows the client's time of day", () => {
  it.each([
    ["2026-03-04T05:00:00.000Z", "Morning"],
    ["2026-03-04T11:59:00.000Z", "Morning"],
    ["2026-03-04T12:00:00.000Z", "Afternoon"],
    ["2026-03-04T16:59:00.000Z", "Afternoon"],
    ["2026-03-04T17:00:00.000Z", "Evening"],
    ["2026-03-04T04:59:00.000Z", "Evening"],
  ])("%s is %s", (at, word) => {
    expect(dayPartWord(new Date(at), "UTC")).toBe(word);
  });

  it("uses the given time zone", () => {
    expect(dayPartWord(new Date("2026-03-05T01:33:00.000Z"), "America/Los_Angeles")).toBe("Evening");
  });

  it("has no word for an unknown time zone", () => {
    expect(dayPartWord(new Date("2026-03-04T12:00:00.000Z"), "Not/AZone")).toBeNull();
  });

  it("renders the word it is given", () => {
    expect(renderToStaticMarkup(<Greeting first="Pat" word="Evening" />)).toContain("Evening, Pat.");
    expect(renderToStaticMarkup(<Greeting word="Evening" />)).toContain("Evening.");
  });
});

describe("the Appointments tile", () => {
  const tile = (result: CalendarResult | null) => renderToStaticMarkup(<AppointmentsTile result={result} />);

  it("counts today and the week", () => {
    expect(tile(ready([stop("a", 3), stop("b", 3), stop("c", 5)]))).toContain('aria-label="Appointments: 2 today, 3 this week. Open the calendar"');
  });

  it("counts zero when nothing is booked", () => {
    expect(tile(empty)).toContain('aria-label="Appointments: 0 today, 0 this week. Open the calendar"');
  });

  it.each([
    ["incomplete", ready([stop("a", 3)], { complete: false })],
    ["with left-out rows", ready([stop("a", 3)], { dropped: 1 })],
    ["unavailable", { state: "unavailable" } as CalendarResult],
    ["reconnect", { state: "reconnect" } as CalendarResult],
  ])("shows no number when %s", (_name, result) => {
    const out = tile(result);
    expect(out).toContain("Not available yet");
    expect(out).not.toMatch(/<b>\d/);
  });
});

describe("Today's calendar card", () => {
  const card = (result: CalendarResult | null) => renderToStaticMarkup(<TodayCalendarCard result={result} />);

  it("lists only today's real appointments", () => {
    const out = card(ready([stop("a", 3), stop("b", 5)]));
    expect(out).toContain("Stop a");
    expect(out).not.toContain("Stop b");
    expect(out).toContain("1 appointment");
  });

  it("marks a finished appointment and the next one", () => {
    const out = card(ready([stop("a", 3, true), stop("b", 3), stop("c", 3)]));
    expect(out.match(/fd-stop is-past/g)).toHaveLength(1);
    expect(out.match(/fd-stop is-next/g)).toHaveLength(1);
  });

  it("says plainly when nothing is booked today", () => {
    expect(card(empty)).toContain("Nothing booked today.");
    expect(card(ready([stop("b", 5)]))).toContain("Nothing booked today.");
  });

  it("does not call an incomplete day free", () => {
    expect(card(ready([stop("b", 5)], { complete: false }))).not.toContain("Nothing booked today.");
  });

  it("marks a failed read as a failure", () => {
    expect(card({ state: "unavailable" })).toContain("is-bad");
    expect(card({ state: "reconnect" })).toContain("is-bad");
  });

  it("has no button that would change an appointment", () => {
    expect(card(ready([stop("a", 3)]))).not.toContain("<button");
  });
});

describe("Pipeline group labels", () => {
  it("names a one-stage group once", () => {
    expect(chunkLabel({ first: 10, last: 10 }, 11)).toBe("Stage 11");
    expect(chunkSpan({ first: 10, last: 10 }, ["x", "y", "z", "a", "b", "c", "d", "e", "f", "g", "Call Back"])).toBe("Call Back");
  });

  it("keeps the range for a larger group", () => {
    expect(chunkLabel({ first: 5, last: 9 }, 11)).toBe("Stages 6-10");
    expect(chunkSpan({ first: 0, last: 1 }, ["New", "Won"])).toBe("New to Won");
  });
});
