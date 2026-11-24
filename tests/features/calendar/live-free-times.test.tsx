// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => null,
}));

import { AppShell, buildBusiness } from "@/features/app-shell";
import { CalendarLivePage, liveFreeTimes, loadCalendar, parseBusinessHours, type CalendarEventRow, type CalendarResult } from "@/features/calendar";

// All values are fake. Wednesday March 4, 2026, 12:00 in New York.
const ZONE = "America/New_York";
const NOW = new Date("2026-03-04T17:00:00.000Z");
const HOURS = "Mon - Fri: 8:00 AM - 5:00 PM, Sat: 9:00 AM - 1:00 PM, Sun: Closed";
const row = (id: string, start: string, end: string): CalendarEventRow => ({
  id, calendarId: "c", calendarName: "Job", title: "Pat", address: "", status: "confirmed", startMs: Date.parse(start), endMs: Date.parse(end),
});
const load = (events: CalendarEventRow[], extra: { complete?: boolean; dropped?: number; calendarCount?: number } = {}, week: string | null = null) =>
  loadCalendar("t", week, async (_t, boundsFor) => ({
    ok: true as const, timeZone: ZONE, range: boundsFor(ZONE)!, calendarCount: extra.calendarCount ?? 1, events, dropped: extra.dropped ?? 0, complete: extra.complete ?? true,
  }), () => NOW) as Promise<Extract<CalendarResult, { state: "ready" | "empty" }>>;

afterEach(cleanup);

describe("parseBusinessHours", () => {
  it("reads the wording the app builds from the structured values", () => {
    const week = parseBusinessHours(HOURS)!;
    expect(week[1]).toEqual({ open: 480, close: 1020 });
    expect(week[5]).toEqual({ open: 480, close: 1020 });
    expect(week[6]).toEqual({ open: 540, close: 780 });
    expect(week[0]).toBeNull();
  });

  it("leaves a day that is not stated closed to offers", () => {
    const week = parseBusinessHours("Mon: 7am - 3:30pm")!;
    expect(week[1]).toEqual({ open: 420, close: 930 });
    expect(week[2]).toBeNull();
  });

  it("accepts 24-hour times, en dashes and full day names", () => {
    expect(parseBusinessHours("Monday–Tuesday 08:00–17:00")![2]).toEqual({ open: 480, close: 1020 });
  });

  it.each([
    "", "Call us", "Mon-Fri 8-5", "Mon - Fri: 8:00 - 5:00 PM", "Mon: 5:00 PM - 8:00 AM", "Mon: 9:00 AM - 9:00 AM",
    "Mon: 13:00 PM - 2:00 PM", "Mon: 8:00 AM - 5:00 PM, by appointment", "Mon: 8:00 AM - 5:00 PM, Mon: 9:00 AM - 5:00 PM",
  ])("refuses %j", (text) => {
    expect(parseBusinessHours(text)).toBeNull();
  });

  it("refuses a missing value", () => {
    expect(parseBusinessHours(null)).toBeNull();
    expect(parseBusinessHours(undefined)).toBeNull();
  });
});

describe("liveFreeTimes", () => {
  it("starts at the real opening time, skips closed days and offers only what is ahead", async () => {
    const free = liveFreeTimes(await load([]), HOURS, NOW);
    expect(free.state).toBe("open");
    if (free.state !== "open") return;
    expect(free.visit.map((s) => [s.day, s.label])).toEqual([[3, "12:30 PM"], [4, "8:00 AM"], [5, "8:00 AM"]]);
  });

  it("offers a Sunday when the business says it is open", async () => {
    const free = liveFreeTimes(await load([], {}, "2026-03-08"), "Sun: 10:00 AM - 2:00 PM", NOW);
    expect(free.state === "open" && free.visit[0]).toMatchObject({ day: 0, label: "10:00 AM" });
  });

  it("uses the true end of a busy appointment, in the location's zone", async () => {
    const busy = row("a", "2026-03-05T13:00:00Z", "2026-03-05T14:15:00Z"); // Thu 8:00 to 9:15 AM New York
    const free = liveFreeTimes(await load([busy]), HOURS, NOW);
    expect(free.state === "open" && free.visit.find((s) => s.day === 4)?.label).toBe("9:30 AM");
  });

  it("never runs a stop past closing", async () => {
    const free = liveFreeTimes(await load([]), "Thu: 8:00 AM - 1:00 PM", NOW);
    expect(free.state === "open" && free.visit.map((s) => s.label)).toEqual(["8:00 AM"]);
    expect(free.state === "open" && free.job).toEqual([]);
  });

  it("says when nothing is free", async () => {
    expect(liveFreeTimes(await load([]), "Sun: Closed", NOW).state).toBe("none");
  });

  it("offers nothing when the hours cannot be read", async () => {
    expect(liveFreeTimes(await load([]), "Call us", NOW).state).toBe("no-hours");
    expect(liveFreeTimes(await load([]), null, NOW).state).toBe("no-hours");
  });

  it("offers nothing when a booking may be missing", async () => {
    const busy = row("a", "2026-03-05T13:00:00Z", "2026-03-05T14:00:00Z");
    expect(liveFreeTimes(await load([busy], { complete: false }), HOURS, NOW).state).toBe("unsure");
    expect(liveFreeTimes(await load([busy], { dropped: 1 }), HOURS, NOW).state).toBe("unsure");
    expect(liveFreeTimes(await load([], { calendarCount: 0 }), HOURS, NOW).state).toBe("unsure");
  });

  it("offers nothing in a week that is over", async () => {
    expect(liveFreeTimes(await load([], {}, "2026-02-22"), HOURS, NOW).state).toBe("past");
  });
});

describe("the free times line", () => {
  const show = (result: CalendarResult, free: ReturnType<typeof liveFreeTimes>) =>
    render(<AppShell business={buildBusiness({})} searchRows={[]}><CalendarLivePage result={result} now={NOW} free={free} /></AppShell>);

  it("lists the real times", async () => {
    const result = await load([]);
    show(result, liveFreeTimes(result, HOURS, NOW));
    expect(screen.getByText(/Free for a visit/).textContent).toContain("Wed 4, 12:30 PM");
  });

  it("says so when the hours cannot be read", async () => {
    const result = await load([]);
    show(result, liveFreeTimes(result, "Call us", NOW));
    expect(screen.getByText(/could not read your business hours/i)).toBeTruthy();
    expect(screen.queryByText(/Free for a visit/)).toBeNull();
  });
});
