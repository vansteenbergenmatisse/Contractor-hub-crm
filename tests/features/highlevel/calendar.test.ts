import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CALENDAR_READS_PER_MINUTE, HighLevelHttpError, MAX_CALENDARS, MAX_CALENDAR_RESPONSE_BYTES, MAX_EVENTS_PER_CALENDAR, TokenServiceError,
  buildCalendarReader, createCalendarRequests, parseCalendarEvents, parseCalendarList, parseLocationTimeZone, readCalendarWeek,
} from "@/features/highlevel";

// Fixtures follow the public OpenAPI file (hl-api-notes.md). The real answer is unverified. All values are fake.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const event = (over: Record<string, unknown> = {}) => ({
  id: "e1", calendarId: "cal-a", locationId: "loc-a", title: "Pat Test", address: "1 Test St", appointmentStatus: "confirmed",
  notes: "private note", contactId: "contact-1", startTime: "2026-03-04T10:00:00-05:00", endTime: "2026-03-04T11:00:00-05:00", ...over,
});
const RANGE = { startMs: Date.parse("2026-03-01T05:00:00Z"), endMs: Date.parse("2026-03-08T05:00:00Z") };
const bounds = vi.fn<(zone: string) => typeof RANGE | null>(() => RANGE);

function requests(over: Partial<Record<"location" | "calendars" | "events", () => Promise<Response>>> = {}) {
  return {
    location: vi.fn(over.location ?? (async () => json({ location: { timezone: "America/New_York" } }))),
    calendars: vi.fn(over.calendars ?? (async () => json({ calendars: [{ id: "cal-a", name: "Visits", locationId: "loc-a" }] }))),
    events: vi.fn(over.events ?? (async () => json({ events: [event()] }))),
  };
}
const deps = (r = requests(), locationId: string | null = "loc-a") => ({
  readLocationId: vi.fn(async () => locationId),
  withToken: vi.fn(async (_tenant: string, call: (token: string) => Promise<Response>) => call("tok")),
  requests: r,
});

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  bounds.mockClear();
});
afterEach(() => errorLog.mockRestore());

describe("createCalendarRequests", () => {
  const make = () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => json({}));
    return { fetch, r: createCalendarRequests("https://hl.example.test/", fetch as unknown as typeof globalThis.fetch) };
  };

  it("only sends GET, with the documented path, Version and bearer token", async () => {
    const { fetch, r } = make();
    await r.location("tok", "loc/a");
    await r.calendars("tok", "loc-a");
    await r.events("tok", { locationId: "loc-a", calendarId: "cal-a", startMs: 1000, endMs: 2000 });
    const [loc, cals, evs] = fetch.mock.calls;
    expect(loc[0]).toBe("https://hl.example.test/locations/loc%2Fa");
    expect(loc[1].headers).toMatchObject({ authorization: "Bearer tok", version: "2021-07-28" });
    expect(cals[0]).toBe("https://hl.example.test/calendars/?locationId=loc-a");
    expect(cals[1].headers).toMatchObject({ version: "2021-04-15" });
    expect(evs[0]).toBe("https://hl.example.test/calendars/events?locationId=loc-a&calendarId=cal-a&startTime=1000&endTime=2000");
    expect(evs[1].headers).toMatchObject({ version: "2021-04-15" });
    for (const [, init] of fetch.mock.calls) {
      expect(init.method).toBe("GET");
      expect(init.body).toBeUndefined();
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("turns a network failure into an error with no status and no detail", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("secret detail"));
    const error = await createCalendarRequests("https://hl.example.test", fetch).calendars("tok", "loc-a").catch((e) => e);
    expect(error).toBeInstanceOf(HighLevelHttpError);
    expect(error.status).toBeNull();
    expect(error.message).not.toContain("secret");
  });
});

describe("parsers", () => {
  it("reads the time zone, and refuses an answer without one", () => {
    expect(parseLocationTimeZone({ location: { timezone: " America/Chicago " } })).toBe("America/Chicago");
    for (const bad of [null, {}, { location: {} }, { location: { timezone: 5 } }, { location: { timezone: " " } }]) {
      expect(() => parseLocationTimeZone(bad)).toThrow(/unexpected/);
    }
  });

  it("keeps calendars of this location, drops the rest and counts them", () => {
    const out = parseCalendarList({ calendars: [{ id: "a", name: " Visits ", locationId: "loc-a" }, { id: "b", locationId: "loc-b" }, { id: "" }, null, { id: "a" }, { id: "c" }] }, "loc-a");
    expect(out.calendars).toEqual([{ id: "a", name: "Visits" }, { id: "c", name: null }]);
    expect(out.dropped).toBe(4);
    expect(() => parseCalendarList({ nope: 1 }, "loc-a")).toThrow(/unexpected/);
  });

  it("keeps the known fields and never carries notes, contact id or unknown fields", () => {
    const page = parseCalendarEvents({ events: [event({ extra: "x" })] }, "loc-a", "cal-a");
    expect(page.events).toEqual([{
      id: "e1", calendarId: "cal-a", title: "Pat Test", address: "1 Test St", status: "confirmed",
      startMs: Date.parse("2026-03-04T15:00:00Z"), endMs: Date.parse("2026-03-04T16:00:00Z"),
    }]);
    expect(JSON.stringify(page)).not.toMatch(/private note|contact-1/);
  });

  it("reads a wrong type in an optional field as missing", () => {
    expect(parseCalendarEvents({ events: [event({ title: 7, address: { a: 1 }, appointmentStatus: 3 })] }, "loc-a", "cal-a").events[0]).toMatchObject({ title: null, address: null, status: null });
  });

  it("leaves cancelled and invalid appointments out without counting them as malformed", () => {
    const page = parseCalendarEvents({ events: [event({ id: "x", appointmentStatus: "cancelled" }), event({ id: "y", appointmentStatus: "invalid" }), event({ id: "z" })] }, "loc-a", "cal-a");
    expect(page.events.map((e) => e.id)).toEqual(["z"]);
    expect(page.dropped).toBe(0);
  });

  it("drops and counts malformed rows, other locations, other calendars and unsafe times", () => {
    const page = parseCalendarEvents({
      events: [
        event(), null, "x", [], event({ id: "" }), event({ id: "b", locationId: "loc-b" }), event({ id: "c", calendarId: "cal-b" }),
        event({ id: "d", startTime: "nope" }), event({ id: "e", endTime: undefined }), event({ id: "f", endTime: "2026-03-04T09:00:00-05:00" }),
        event({ id: "g", startTime: "2026-03-04T10:00:00" }), event(),
      ],
    }, "loc-a", "cal-a");
    expect(page.events.map((e) => e.id)).toEqual(["e1"]);
    expect(page.dropped).toBe(11);
  });

  it("caps the rows and says the list is cut off", () => {
    const events = Array.from({ length: MAX_EVENTS_PER_CALENDAR + 1 }, (_, i) => event({ id: `e${i}` }));
    const page = parseCalendarEvents({ events }, "loc-a", "cal-a");
    expect(page.events).toHaveLength(MAX_EVENTS_PER_CALENDAR);
    expect(page.complete).toBe(false);
    expect(() => parseCalendarEvents({ nope: 1 }, "loc-a", "cal-a")).toThrow(/unexpected/);
  });
});

describe("readCalendarWeek", () => {
  it("looks the calendars up for this tenant at runtime and reads each for the week of the location's zone", async () => {
    const r = requests({ calendars: async () => json({ calendars: [{ id: "cal-a", name: "Visits" }, { id: "cal-b", name: "Jobs" }] }), events: async () => json({ events: [] }) });
    const d = deps(r);
    const out = await readCalendarWeek(d, "tenant-a", bounds);
    expect(out).toMatchObject({ ok: true, timeZone: "America/New_York", calendarCount: 2, events: [], dropped: 0, complete: true, range: RANGE });
    expect(bounds).toHaveBeenCalledWith("America/New_York");
    expect(d.readLocationId.mock.calls).toEqual([["tenant-a"]]);
    expect(new Set(d.withToken.mock.calls.map((c) => c[0]))).toEqual(new Set(["tenant-a"]));
    expect(r.events.mock.calls.map((c) => (c as unknown[])[1])).toEqual([
      { locationId: "loc-a", calendarId: "cal-a", ...RANGE },
      { locationId: "loc-a", calendarId: "cal-b", ...RANGE },
    ]);
  });

  it("adds the calendar's name to each event and shows an event only once", async () => {
    const r = requests({
      calendars: async () => json({ calendars: [{ id: "cal-a", name: "Visits" }, { id: "cal-b", name: "Jobs" }] }),
      events: vi.fn()
        .mockResolvedValueOnce(json({ events: [event()] }))
        .mockResolvedValueOnce(json({ events: [event({ calendarId: "cal-b" }), event({ id: "e2", calendarId: "cal-b" })] })),
    });
    const out = await readCalendarWeek(deps(r), "t", bounds);
    if (!out.ok) throw new Error("not ok");
    expect(out.events.map((e) => [e.id, e.calendarName])).toEqual([["e1", "Visits"], ["e2", "Jobs"]]);
  });

  it("answers an empty list when the location has no calendars, with no event read", async () => {
    const r = requests({ calendars: async () => json({ calendars: [] }) });
    expect(await readCalendarWeek(deps(r), "t", bounds)).toMatchObject({ ok: true, calendarCount: 0, events: [], complete: true });
    expect(r.events).not.toHaveBeenCalled();
  });

  it("reads at most the calendar cap and says the week is cut off", async () => {
    const calendars = Array.from({ length: MAX_CALENDARS + 1 }, (_, i) => ({ id: `c${i}` }));
    const r = requests({ calendars: async () => json({ calendars }), events: async () => json({ events: [] }) });
    const out = await readCalendarWeek(deps(r), "t", bounds);
    expect(r.events).toHaveBeenCalledTimes(MAX_CALENDARS);
    expect(out).toMatchObject({ ok: true, complete: false });
  });

  it("asks for reconnect when the tenant has no location, without calling HighLevel", async () => {
    const r = requests();
    expect(await readCalendarWeek(deps(r, null), "t", bounds)).toEqual({ ok: false, reason: "reconnect" });
    expect(r.location).not.toHaveBeenCalled();
  });

  it("is unavailable when the zone cannot be used, before any calendar read", async () => {
    const r = requests();
    bounds.mockReturnValueOnce(null);
    expect(await readCalendarWeek(deps(r), "t", bounds)).toEqual({ ok: false, reason: "unavailable" });
    expect(r.calendars).not.toHaveBeenCalled();
  });

  it.each([
    ["not_connected", "reconnect"], ["needs_reconnect", "reconnect"], ["agency_unavailable", "reconnect"], ["unavailable", "unavailable"],
  ] as const)("token error %s becomes %s", async (code, reason) => {
    const d = deps();
    d.withToken.mockRejectedValue(new TokenServiceError(code));
    expect(await readCalendarWeek(d, "t", bounds)).toEqual({ ok: false, reason });
  });

  it.each([[401, "reconnect"], [403, "unavailable"], [400, "unavailable"], [404, "unavailable"], [429, "unavailable"], [500, "unavailable"]])("HTTP %i on an event read becomes %s, shows nothing partial and logs no body", async (status, reason) => {
    const r = requests({
      calendars: async () => json({ calendars: [{ id: "cal-a" }, { id: "cal-b" }] }),
      events: vi.fn().mockResolvedValueOnce(json({ events: [event()] })).mockResolvedValue(json({ message: "Pat Test secret" }, status)),
    });
    expect(await readCalendarWeek(deps(r), "t", bounds)).toEqual({ ok: false, reason });
    expect(JSON.stringify(errorLog.mock.calls)).not.toMatch(/Pat Test|secret|loc-a|cal-a/);
  });

  it("an unreadable answer is unavailable", async () => {
    const r = requests({ events: async () => new Response("<html>", { status: 200 }) });
    expect(await readCalendarWeek(deps(r), "t", bounds)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects a declared oversized body without reading it", async () => {
    const cancel = vi.fn();
    const pull = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const headers = { "content-length": String(MAX_CALENDAR_RESPONSE_BYTES + 1) };
    const r = requests({ events: async () => new Response(body, { status: 200, headers }) });
    expect(await readCalendarWeek(deps(r), "t", bounds)).toEqual({ ok: false, reason: "unavailable" });
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });
});

describe("buildCalendarReader", () => {
  const runtime = () => {
    const call = async (_tenant: string, run: (token: string) => Promise<Response>) => run("tok");
    return {
      readLocationId: vi.fn(async () => "loc-a"),
      withLocationToken: vi.fn(call),
      withStoredLocationToken: vi.fn(call),
      requests: requests(),
    };
  };

  it("counts per tenant, before reading, and uses the normal token path", async () => {
    const rt = runtime();
    const hit = vi.fn(async () => true);
    const out = await buildCalendarReader(() => rt, hit)("tenant-a", bounds);
    expect(out).toMatchObject({ ok: true });
    expect(CALENDAR_READS_PER_MINUTE).toBe(20);
    expect(hit).toHaveBeenCalledWith("highlevel-calendar:tenant-a", 20, 60_000, expect.any(Date));
    expect(rt.withLocationToken).toHaveBeenCalled();
    expect(rt.withStoredLocationToken).not.toHaveBeenCalled();
  });

  it("an admin's client view never refreshes a token and counts against the viewer, not the client", async () => {
    const rt = runtime();
    const hit = vi.fn(async () => true);
    const out = await buildCalendarReader(() => rt, hit, { viewerId: "admin-1" })("tenant-a", bounds);
    expect(out).toMatchObject({ ok: true });
    expect(rt.withLocationToken).not.toHaveBeenCalled();
    expect(rt.withStoredLocationToken).toHaveBeenCalled();
    expect(rt.withStoredLocationToken.mock.calls.every((c) => c[0] === "tenant-a")).toBe(true);
    expect(hit).toHaveBeenCalledTimes(1);
    expect(hit).toHaveBeenCalledWith("highlevel-calendar-view:admin-1", 20, 60_000, expect.any(Date));
  });

  it("a client view with no usable stored token is unavailable, not reconnect", async () => {
    const rt = runtime();
    rt.withStoredLocationToken.mockRejectedValue(new TokenServiceError("unavailable"));
    expect(await buildCalendarReader(() => rt, async () => true, { viewerId: "admin-1" })("t", bounds)).toEqual({ ok: false, reason: "unavailable" });
    expect(rt.withLocationToken).not.toHaveBeenCalled();
  });

  it("over the limit, or with a broken limiter, is unavailable and touches nothing", async () => {
    const make = vi.fn(() => runtime());
    expect(await buildCalendarReader(make, async () => false)("t", bounds)).toEqual({ ok: false, reason: "unavailable" });
    const broken = async () => {
      throw new Error("db secret detail");
    };
    expect(await buildCalendarReader(make, broken)("t", bounds)).toEqual({ ok: false, reason: "unavailable" });
    expect(make).not.toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret");
  });

  it("an incomplete environment is unavailable", async () => {
    const make = () => {
      throw new Error("GHL_API_BASE_URL missing");
    };
    expect(await buildCalendarReader(make, async () => true)("t", bounds)).toEqual({ ok: false, reason: "unavailable" });
  });
});
