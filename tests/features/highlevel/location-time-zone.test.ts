import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCATION_ZONE_READS_PER_MINUTE,
  LOCATION_ZONE_TIMEOUT_MS,
  buildLocationTimeZoneReader,
  type LocationZoneCache,
  type LocationZoneRuntime,
} from "@/features/highlevel";

// All values are fake.
const zoneResponse = (timezone: unknown = "America/Chicago") => new Response(JSON.stringify({ location: { timezone } }), { status: 200 });

function setup(over: Partial<LocationZoneRuntime> = {}) {
  const request = vi.fn<LocationZoneRuntime["request"]>(async () => zoneResponse());
  const withLocationToken = vi.fn(async (_tenant: string, call: (token: string) => Promise<Response>) => call("fresh"));
  const withStoredLocationToken = vi.fn(async (_tenant: string, call: (token: string) => Promise<Response>) => call("stored"));
  const runtime: LocationZoneRuntime = { readLocationId: async () => "loc-1", withLocationToken, withStoredLocationToken, request, ...over };
  const hit = vi.fn(async () => true);
  const cache: LocationZoneCache = new Map();
  return { runtime, request, withLocationToken, withStoredLocationToken, hit, cache };
}

let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  error.mockRestore();
  vi.useRealTimers();
});

describe("the location time zone read", () => {
  it("reads one location with the tenant's token and its own limiter key", async () => {
    const s = setup();
    const read = buildLocationTimeZoneReader(() => s.runtime, s.hit, undefined, { cache: s.cache });
    expect(await read("tenant-a")).toBe("America/Chicago");
    expect(s.request).toHaveBeenCalledTimes(1);
    expect(s.request).toHaveBeenCalledWith("fresh", "loc-1");
    expect(s.hit).toHaveBeenCalledWith("highlevel-location-zone:tenant-a", LOCATION_ZONE_READS_PER_MINUTE, 60_000, expect.any(Date));
  });

  it("View as client uses the stored token and a per-viewer limit only", async () => {
    const s = setup();
    const read = buildLocationTimeZoneReader(() => s.runtime, s.hit, { viewerId: "admin-1" }, { cache: s.cache });
    expect(await read("tenant-a")).toBe("America/Chicago");
    expect(s.withStoredLocationToken).toHaveBeenCalledTimes(1);
    expect(s.withLocationToken).not.toHaveBeenCalled();
    expect(s.request).toHaveBeenCalledWith("stored", "loc-1");
    expect(s.hit).toHaveBeenCalledWith("highlevel-location-zone-view:admin-1", LOCATION_ZONE_READS_PER_MINUTE, 60_000, expect.any(Date));
  });

  it("caches the zone per tenant", async () => {
    const s = setup();
    const read = buildLocationTimeZoneReader(() => s.runtime, s.hit, undefined, { cache: s.cache });
    await read("tenant-a");
    await read("tenant-a");
    expect(s.request).toHaveBeenCalledTimes(1);
    await read("tenant-b");
    expect(s.request).toHaveBeenCalledTimes(2);
  });

  it("reads again after the cached zone expires", async () => {
    const s = setup();
    let at = 1_000;
    const read = buildLocationTimeZoneReader(() => s.runtime, s.hit, undefined, { cache: s.cache, now: () => new Date(at), ttlMs: 100 });
    await read("tenant-a");
    at = 1_101;
    await read("tenant-a");
    expect(s.request).toHaveBeenCalledTimes(2);
  });

  it("answers null on a slow read, within the time limit", async () => {
    vi.useFakeTimers();
    const s = setup({ request: () => new Promise<Response>(() => {}) });
    const read = buildLocationTimeZoneReader(() => s.runtime, s.hit, undefined, { cache: s.cache });
    const answer = read("tenant-a");
    await vi.advanceTimersByTimeAsync(LOCATION_ZONE_TIMEOUT_MS);
    await expect(answer).resolves.toBeNull();
  });

  it("a slow limiter or token step is bound by the same limit", async () => {
    vi.useFakeTimers();
    const s = setup();
    const read = buildLocationTimeZoneReader(() => s.runtime, () => new Promise<boolean>(() => {}), undefined, { cache: s.cache });
    const answer = read("tenant-a");
    await vi.advanceTimersByTimeAsync(LOCATION_ZONE_TIMEOUT_MS);
    await expect(answer).resolves.toBeNull();
    expect(s.request).not.toHaveBeenCalled();
  });

  it.each([
    ["a failed request", { request: async () => new Response("no", { status: 500 }) }],
    ["a request that throws", { request: async () => { throw new Error("down"); } }],
    ["no location", { readLocationId: async () => null }],
    ["a bad body", { request: async () => new Response("not json", { status: 200 }) }],
    ["no zone", { request: async () => new Response("{}", { status: 200 }) }],
    ["an unknown zone name", { request: async () => zoneResponse("Not/AZone") }],
  ] as Array<[string, Partial<LocationZoneRuntime>]>)("answers null on %s and caches nothing", async (_name, over) => {
    const s = setup(over);
    const read = buildLocationTimeZoneReader(() => s.runtime, s.hit, undefined, { cache: s.cache });
    await expect(read("tenant-a")).resolves.toBeNull();
    expect(s.cache.size).toBe(0);
  });

  it("answers null without a request when limited, when the limiter fails, without a tenant or env", async () => {
    const s = setup();
    const options = { cache: s.cache };
    await expect(buildLocationTimeZoneReader(() => s.runtime, async () => false, undefined, options)("t")).resolves.toBeNull();
    await expect(buildLocationTimeZoneReader(() => s.runtime, async () => { throw new Error("db"); }, undefined, options)("t")).resolves.toBeNull();
    await expect(buildLocationTimeZoneReader(() => s.runtime, s.hit, undefined, options)(null)).resolves.toBeNull();
    await expect(buildLocationTimeZoneReader(() => { throw new Error("env"); }, s.hit, undefined, options)("t")).resolves.toBeNull();
    expect(s.request).not.toHaveBeenCalled();
  });
});
