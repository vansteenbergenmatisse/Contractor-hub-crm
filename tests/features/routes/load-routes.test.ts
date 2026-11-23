import { afterEach, describe, expect, it, vi } from "vitest";
import { directionsUrl, distanceMiles, distanceLabel, loadRoutes, parseCoordinates, type RouteEventRow, type RoutesReader } from "@/features/routes";

// Wednesday, Mar 4 2026, 12:00 in New York (EST). All values are fake.
const NOW = new Date("2026-03-04T17:00:00.000Z");
const now = () => NOW;
const ZONE = "America/New_York";
const at = (iso: string) => Date.parse(iso);
const row = (over: Partial<RouteEventRow> = {}): RouteEventRow => ({
  id: "e1", calendarId: "cal-a", calendarName: "Visits", title: "Pat Test", address: "1 Test St", status: "confirmed",
  startMs: at("2026-03-04T18:00:00Z"), endMs: at("2026-03-04T19:00:00Z"), ...over,
});
const reader = (events: RouteEventRow[], extra: { dropped?: number; complete?: boolean; calendarCount?: number } = {}): RoutesReader =>
  vi.fn(async (_tenant, boundsFor) => {
    const range = boundsFor(ZONE);
    if (!range) return { ok: false as const, reason: "unavailable" as const };
    return { ok: true as const, timeZone: ZONE, range, calendarCount: extra.calendarCount ?? 1, events, dropped: extra.dropped ?? 0, complete: extra.complete ?? true };
  }) as unknown as RoutesReader;
const ready = async (events: RouteEventRow[], extra = {}) => {
  const out = await loadRoutes("tenant-a", reader(events, extra), now);
  if (out.state !== "ready") throw new Error(`not ready: ${out.state}`);
  return out;
};
const answer = (reason: "reconnect" | "unavailable") => (async () => ({ ok: false as const, reason })) as RoutesReader;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("loadRoutes", () => {
  it("is unavailable with no tenant, without reading", async () => {
    const read = reader([]);
    expect(await loadRoutes(null, read, now)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("honors the calendar read kill switch", async () => {
    vi.stubEnv("CALENDAR_READ_DISABLED", "true");
    const read = reader([row()]);
    expect(await loadRoutes("tenant-a", read, now)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("reads exactly today in the client's time zone", async () => {
    let bounds: ((zone: string) => unknown) | undefined;
    const read = (async (_tenant: string, boundsFor: (zone: string) => { startMs: number; endMs: number } | null) => {
      bounds = boundsFor;
      return { ok: false as const, reason: "unavailable" as const };
    }) as RoutesReader;
    await loadRoutes("tenant-a", read, now);
    expect(bounds?.(ZONE)).toEqual({ startMs: at("2026-03-04T05:00:00Z"), endMs: at("2026-03-05T05:00:00Z") });
    expect(bounds?.("Asia/Tokyo")).toEqual({ startMs: at("2026-03-04T15:00:00Z"), endMs: at("2026-03-05T15:00:00Z") });
    expect(bounds?.("Mars/Olympus")).toBeNull();
  });

  it("passes reconnect and unavailable through, and a thrown read is unavailable", async () => {
    expect(await loadRoutes("t", answer("reconnect"), now)).toEqual({ state: "reconnect" });
    expect(await loadRoutes("t", answer("unavailable"), now)).toEqual({ state: "unavailable" });
    expect(await loadRoutes("t", (async () => { throw new Error("boom"); }) as RoutesReader, now)).toEqual({ state: "unavailable" });
  });

  it("separates no calendars from nothing booked", async () => {
    expect(await loadRoutes("t", reader([], { calendarCount: 0 }), now)).toMatchObject({ state: "empty", reason: "no-calendars" });
    expect(await loadRoutes("t", reader([]), now)).toMatchObject({ state: "empty", reason: "no-appointments" });
  });

  it("never calls a partial read with no rows a free day", async () => {
    expect(await loadRoutes("t", reader([], { complete: false }), now)).toEqual({ state: "unavailable" });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadRoutes("t", reader([], { dropped: 1 }), now)).toEqual({ state: "unavailable" });
  });

  it("marks a partial read", async () => {
    expect((await ready([row()], { complete: false })).partial).toBe(true);
    expect((await ready([row()])).partial).toBe(false);
  });

  it("orders by true start time and labels in the client's zone", async () => {
    const out = await ready([
      row({ id: "late", startMs: at("2026-03-04T20:15:00Z"), endMs: at("2026-03-04T21:00:00Z") }),
      row({ id: "early", startMs: at("2026-03-04T14:05:00Z"), endMs: at("2026-03-04T15:00:00Z") }),
    ]);
    expect(out.jobs.map((j) => j.id)).toEqual(["early", "late"]);
    expect(out.jobs[0].timeLabel).toBe("9:05 AM to 10:00 AM");
    expect(out.jobs[1].timeLabel).toBe("3:15 PM to 4:00 PM");
  });

  it("leaves out rows that do not touch today", async () => {
    const out = await ready([row(), row({ id: "tomorrow", startMs: at("2026-03-05T15:00:00Z"), endMs: at("2026-03-05T16:00:00Z") })]);
    expect(out.jobs.map((j) => j.id)).toEqual(["e1"]);
  });

  it("says when a job runs past the edges of today", async () => {
    const out = await ready([row({ startMs: at("2026-03-03T22:00:00Z"), endMs: at("2026-03-05T07:00:00Z") })]);
    expect(out.jobs[0].timeLabel).toBe("Started earlier, runs past today");
  });

  it("next is the first job not finished, by HighLevel's status only", async () => {
    const out = await ready([
      row({ id: "a", status: "showed", startMs: at("2026-03-04T13:00:00Z"), endMs: at("2026-03-04T14:00:00Z") }),
      row({ id: "b", status: "Completed", startMs: at("2026-03-04T14:00:00Z"), endMs: at("2026-03-04T15:00:00Z") }),
      row({ id: "c", status: "noshow", startMs: at("2026-03-04T15:00:00Z"), endMs: at("2026-03-04T15:30:00Z") }),
      row({ id: "d", status: "confirmed", startMs: at("2026-03-04T16:00:00Z"), endMs: at("2026-03-04T16:30:00Z") }),
      row({ id: "e", status: "new", startMs: at("2026-03-04T18:00:00Z"), endMs: at("2026-03-04T19:00:00Z") }),
    ]);
    expect(out.nextId).toBe("d");
    expect(out.jobs.map((j) => j.done)).toEqual([true, true, true, false, false]);
    expect(out.jobs.map((j) => j.statusLabel)).toEqual(["Showed", "Completed", "No show", "Confirmed", "New"]);
  });

  it("does not treat a past time as done, and says so", async () => {
    const out = await ready([row({ startMs: at("2026-03-04T14:00:00Z"), endMs: at("2026-03-04T15:00:00Z") })]);
    expect(out.nextId).toBe("e1");
    expect(out.jobs[0].done).toBe(false);
    expect(out.jobs[0].pastTime).toBe(true);
  });

  it("leaves cancelled rows out and has no next when all are done", async () => {
    const out = await ready([row({ id: "x", status: "cancelled" }), row({ id: "y", status: "canceled" }), row({ id: "z", status: "showed" })]);
    expect(out.jobs.map((j) => j.id)).toEqual(["z"]);
    expect(out.nextId).toBeNull();
  });

  it("is a calm empty day when every row is cancelled", async () => {
    expect(await loadRoutes("t", reader([row({ status: "cancelled" })]), now)).toMatchObject({ state: "empty", reason: "no-appointments" });
  });

  it("names a job plainly and gives no link without an address", async () => {
    const out = await ready([row({ title: null, address: null })]);
    expect(out.jobs[0].name).toBe("Appointment");
    expect(out.jobs[0].address).toBeNull();
    expect(out.jobs[0].mapsUrl).toBeNull();
  });
});

describe("directionsUrl", () => {
  it("is the documented Maps URL with an encoded address and no key", () => {
    expect(directionsUrl("12 Oak St #4, Town & Co")).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=12%20Oak%20St%20%234%2C%20Town%20%26%20Co&travelmode=driving",
    );
  });
});

describe("distance", () => {
  it("reads only an address that is itself a coordinate pair", () => {
    expect(parseCoordinates("40.7128, -74.0060")).toEqual({ lat: 40.7128, lng: -74.006 });
    expect(parseCoordinates("12 Oak St")).toBeNull();
    expect(parseCoordinates("12, 34")).toBeNull();
    expect(parseCoordinates("95.0, 10.0")).toBeNull();
    expect(parseCoordinates("10.0, 190.0")).toBeNull();
  });

  it("measures a straight line", () => {
    const miles = distanceMiles({ lat: 40.7128, lng: -74.006 }, { lat: 42.3601, lng: -71.0589 });
    expect(miles).toBeGreaterThan(188);
    expect(miles).toBeLessThan(192);
    expect(distanceMiles({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0);
  });

  it("labels the distance as approximate", () => {
    expect(distanceLabel(3.26)).toBe("About 3.3 mi in a straight line (approximate)");
    expect(distanceLabel(0.04)).toBe("Less than 0.1 mi in a straight line (approximate)");
    expect(distanceLabel(42.4)).toBe("About 42 mi in a straight line (approximate)");
  });
});
