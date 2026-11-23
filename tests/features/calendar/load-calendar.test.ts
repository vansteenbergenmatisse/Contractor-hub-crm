import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCalendar, weekRange, type CalendarEventRow, type CalendarWeekReader } from "@/features/calendar";

// Wednesday, Mar 4 2026, 12:00 in New York (EST, UTC-5). All values are fake.
const NOW = new Date("2026-03-04T17:00:00.000Z");
const now = () => NOW;
const ZONE = "America/New_York";
const at = (iso: string) => Date.parse(iso);
const row = (over: Partial<CalendarEventRow> = {}): CalendarEventRow => ({
  id: "e1", calendarId: "cal-a", calendarName: "Visits", title: "Pat Test", address: "1 Test St", status: "confirmed",
  startMs: at("2026-03-04T15:00:00Z"), endMs: at("2026-03-04T16:00:00Z"), ...over,
});
const reader = (events: CalendarEventRow[], extra: { dropped?: number; complete?: boolean; calendarCount?: number; timeZone?: string } = {}): CalendarWeekReader =>
  vi.fn(async (_tenant, boundsFor) => {
    const timeZone = extra.timeZone ?? ZONE;
    const range = boundsFor(timeZone);
    if (!range) return { ok: false as const, reason: "unavailable" as const };
    return { ok: true as const, timeZone, range, calendarCount: extra.calendarCount ?? 1, events, dropped: extra.dropped ?? 0, complete: extra.complete ?? true };
  });
const ready = async (events: CalendarEventRow[], week: string | null = null) => {
  const out = await loadCalendar("tenant-a", week, reader(events), now);
  if (out.state !== "ready") throw new Error(`not ready: ${out.state}`);
  return out;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("weekRange", () => {
  it("is the Sunday to Sunday of the location's own zone", () => {
    const r = weekRange(ZONE, null, NOW)!;
    expect(r.weekStart).toBe("2026-03-01");
    expect(r.startMs).toBe(at("2026-03-01T05:00:00Z"));
    expect(r.endMs).toBe(at("2026-03-08T05:00:00Z"));
    expect(r.todayDay).toBe(3);
    expect([r.prevWeek, r.nextWeek]).toEqual(["2026-02-22", "2026-03-08"]);
  });

  it("uses the location's date, not the server's, near midnight", () => {
    const saturdayNight = new Date("2026-03-08T03:00:00.000Z"); // still Saturday Mar 7 in New York
    expect(weekRange(ZONE, null, saturdayNight)!.weekStart).toBe("2026-03-01");
    expect(weekRange("Asia/Tokyo", null, saturdayNight)!.weekStart).toBe("2026-03-08");
  });

  it("keeps the true length of a week with a clock change", () => {
    const r = weekRange(ZONE, "2026-03-08", NOW)!;
    expect(r.startMs).toBe(at("2026-03-08T05:00:00Z"));
    expect(r.endMs).toBe(at("2026-03-15T04:00:00Z"));
    expect(r.todayDay).toBeNull();
  });

  it.each(["nope", "2026-13-01", "2026-02-31", "2026-03-02", "2030-03-03", "2020-03-01", ""])("falls back to this week for the unusable week %j", (week) => {
    expect(weekRange(ZONE, week, NOW)!.weekStart).toBe("2026-03-01");
  });

  it("answers null for a zone that does not exist", () => {
    expect(weekRange("Mars/Olympus", null, NOW)).toBeNull();
  });
});

describe("loadCalendar states", () => {
  it("is unavailable with no tenant, without reading", async () => {
    const read = reader([]);
    expect(await loadCalendar(null, null, read, now)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("CALENDAR_READ_DISABLED=true turns the read off", async () => {
    vi.stubEnv("CALENDAR_READ_DISABLED", "true");
    const read = reader([row()]);
    expect(await loadCalendar("t", null, read, now)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["reconnect", "unavailable"] as const)("passes on %s", async (reason) => {
    expect(await loadCalendar("t", null, vi.fn(async () => ({ ok: false as const, reason })), now)).toEqual({ state: reason });
  });

  it("a reader that throws is unavailable", async () => {
    expect(await loadCalendar("t", null, vi.fn().mockRejectedValue(new Error("x")), now)).toEqual({ state: "unavailable" });
  });

  it("tells no calendars from a week with nothing booked, and keeps the week to navigate", async () => {
    const none = await loadCalendar("t", null, reader([], { calendarCount: 0 }), now);
    expect(none).toMatchObject({ state: "empty", reason: "no-calendars", week: { weekStart: "2026-03-01", timeZone: ZONE } });
    expect(await loadCalendar("t", null, reader([]), now)).toMatchObject({ state: "empty", reason: "no-appointments" });
  });

  it("never calls a week empty when rows were dropped or the read was cut off", async () => {
    expect(await loadCalendar("t", null, reader([], { dropped: 1 }), now)).toEqual({ state: "unavailable" });
    expect(await loadCalendar("t", null, reader([], { complete: false }), now)).toEqual({ state: "unavailable" });
  });

  it("logs a count only, never a customer value", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await loadCalendar("t", null, reader([row()], { dropped: 2 }), now);
    expect(JSON.stringify(warn.mock.calls)).toContain("2");
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Pat Test|Test St|cal-a|tenant/);
  });

  it("passes the week from the URL to the range", async () => {
    const out = await ready([row({ startMs: at("2026-03-09T15:00:00Z"), endMs: at("2026-03-09T16:00:00Z") })], "2026-03-08");
    expect(out.week.weekStart).toBe("2026-03-08");
    expect(out.week.todayDay).toBeNull();
    expect(out.stops[0].day).toBe(1);
  });
});

describe("placing appointments", () => {
  it("places a stop by the location's clock, with its true times", async () => {
    const { stops } = await ready([row()]);
    expect(stops).toEqual([expect.objectContaining({
      id: "e1:3", eventId: "e1", day: 3, start: 6, len: 2, lane: 0, lanes: 1, name: "Pat Test", service: "Visits", address: "1 Test St",
      statusLabel: "Confirmed", startLabel: "10:00 AM", endLabel: "11:00 AM", past: true,
    })]);
  });

  it("shows a neutral name when the appointment has no title, and no status it does not know", async () => {
    const { stops } = await ready([row({ title: null, address: null, calendarName: null, status: "something" })]);
    expect(stops[0]).toMatchObject({ name: "Appointment", service: "", address: "", statusLabel: "" });
  });

  it("keeps an off-grid or off-half-hour time truthful in its label", async () => {
    const { stops } = await ready([
      row({ id: "early", startMs: at("2026-03-05T10:00:00Z"), endMs: at("2026-03-05T11:00:00Z") }), // 5:00 to 6:00 AM
      row({ id: "late", startMs: at("2026-03-06T00:15:00Z"), endMs: at("2026-03-06T01:00:00Z") }), // Thu 7:15 to 8:00 PM
      row({ id: "odd", startMs: at("2026-03-02T14:10:00Z"), endMs: at("2026-03-02T14:50:00Z") }), // Mon 9:10 to 9:50 AM
    ]);
    const by = (id: string) => stops.find((s) => s.eventId === id)!;
    expect(by("early")).toMatchObject({ start: 0, len: 1, startLabel: "5:00 AM", endLabel: "6:00 AM" });
    expect(by("late")).toMatchObject({ start: 21, len: 1, startLabel: "7:15 PM", endLabel: "8:00 PM" });
    expect(by("odd")).toMatchObject({ start: 4, len: 2, startLabel: "9:10 AM", endLabel: "9:50 AM" });
  });

  it("splits an appointment over midnight into one stop per day", async () => {
    const { stops } = await ready([row({ startMs: at("2026-03-05T03:00:00Z"), endMs: at("2026-03-05T15:00:00Z") })]); // Wed 10 PM to Thu 10 AM
    expect(stops.map((s) => [s.id, s.day, s.startLabel, s.endLabel])).toEqual([
      ["e1:3", 3, "10:00 PM", "12:00 AM"],
      ["e1:4", 4, "12:00 AM", "10:00 AM"],
    ]);
  });

  it("leaves out what lies outside the week", async () => {
    const out = await loadCalendar("t", null, reader([row({ startMs: at("2026-03-10T15:00:00Z"), endMs: at("2026-03-10T16:00:00Z") })]), now);
    expect(out).toMatchObject({ state: "empty", reason: "no-appointments" });
  });

  it("gives overlapping stops their own lane, so none is hidden", async () => {
    const { stops } = await ready([
      row({ id: "a" }),
      row({ id: "b", startMs: at("2026-03-04T15:30:00Z"), endMs: at("2026-03-04T16:30:00Z") }),
      row({ id: "c", startMs: at("2026-03-04T18:00:00Z"), endMs: at("2026-03-04T19:00:00Z") }),
    ]);
    const by = (id: string) => stops.find((s) => s.eventId === id)!;
    expect([by("a").lane, by("a").lanes]).toEqual([0, 2]);
    expect([by("b").lane, by("b").lanes]).toEqual([1, 2]);
    expect([by("c").lane, by("c").lanes]).toEqual([0, 1]);
  });

  it("marks only what has ended as past", async () => {
    const { stops } = await ready([row({ id: "now", startMs: at("2026-03-04T16:30:00Z"), endMs: at("2026-03-04T17:30:00Z") })]);
    expect(stops[0].past).toBe(false);
  });
});
