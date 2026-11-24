import { afterEach, describe, expect, it, vi } from "vitest";
import { HighLevelHttpError } from "../../../src/features/highlevel/api/client";
import { readCustomValuesWithStoredToken } from "../../../src/features/highlevel/api/custom-values";
import { readPhoneNumbers } from "../../../src/features/highlevel/api/phone-numbers";

// Bug 2026-11-24: on a new sub-account, Settings in View client showed "Your details did not load"
// and the phone row failed with `step=parse`, but no log said why. These reads must name the step
// that failed, never a value, a token or a body. Made-up values only.
afterEach(() => vi.restoreAllMocks());

const logged = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((call) => String(call[0]));
const now = new Date("2026-11-24T15:00:00Z");
const state = (over: Record<string, unknown> = {}) => ({
  status: "connected" as const,
  accessToken: "secret-token",
  locationId: "loc_1",
  expiresAt: new Date("2026-11-25T15:00:00Z"),
  ...over,
});

describe("custom values read with the stored token: says why it read nothing", () => {
  it.each([
    ["no stored connection", null, "reason=no-connection"],
    ["a tenant that is not connected", state({ status: "needs_reconnect" }), "reason=not-connected"],
    ["an expired stored token", state({ expiresAt: new Date("2026-11-24T14:00:00Z") }), "reason=expired"],
  ])("logs %s", async (_label, stored, reason) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await readCustomValuesWithStoredToken({ readState: async () => stored, listCustomValues: vi.fn(), now: () => now }, "t1");
    expect(out).toBeNull();
    expect(logged(error)).toEqual([`HighLevel custom values read (stored token) skipped: ${reason}`]);
  });

  it("logs the status when HighLevel refuses the stored token", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const listCustomValues = vi.fn(async () => {
      throw new HighLevelHttpError("HighLevel custom values failed (status 401).", 401, { body: "secret-body" });
    });
    expect(await readCustomValuesWithStoredToken({ readState: async () => state(), listCustomValues, now: () => now }, "t1")).toBeNull();
    expect(logged(error)).toEqual(["HighLevel custom values read (stored token) failed: step=request status=401"]);
  });

  it("logs the step before passing any other failure on", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const http = vi.fn(async () => {
      throw new HighLevelHttpError("HighLevel custom values failed (status 422).", 422, { body: "secret-body" });
    });
    await expect(readCustomValuesWithStoredToken({ readState: async () => state(), listCustomValues: http, now: () => now }, "t1")).rejects.toThrow();
    const parse = vi.fn(async () => {
      throw new Error("HighLevel custom values returned an unexpected response.");
    });
    await expect(readCustomValuesWithStoredToken({ readState: async () => state(), listCustomValues: parse, now: () => now }, "t1")).rejects.toThrow();
    expect(logged(error)).toEqual([
      "HighLevel custom values read (stored token) failed: step=request status=422",
      "HighLevel custom values read (stored token) failed: step=parse",
    ]);
    expect(logged(error).join(" ")).not.toMatch(/secret/);
  });

  it("logs nothing when the read works", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await readCustomValuesWithStoredToken({ readState: async () => state(), listCustomValues: async () => [{ key: "a", value: "b" }], now: () => now }, "t1");
    expect(out).toEqual([{ key: "a", value: "b" }]);
    expect(error).not.toHaveBeenCalled();
  });
});

describe("phone read: names the shape check that failed", () => {
  const deps = (response: Response) => ({
    readLocationId: vi.fn(async () => "loc_1" as string | null),
    withToken: vi.fn(async (_t: string, call: (token: string) => Promise<Response>) => call("token")),
    requests: { list: vi.fn(async () => response) },
  });

  it.each([
    ["an empty body", new Response("", { status: 200 }), "step=parse detail=not-json"],
    ["text that is not JSON", new Response("nope", { status: 200 }), "step=parse detail=not-json"],
    ["a JSON array", new Response("[]", { status: 200 }), "step=parse detail=not-object"],
    [
      "an object without a numbers list",
      new Response(JSON.stringify({ message: "secret text", phoneNumbers: [{ phoneNumber: "+15550100000" }], "bad key!": 1 }), { status: 200 }),
      "step=parse detail=no-numbers-list keys=message,phoneNumbers",
    ],
  ])("logs %s", async (_label, response, line) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readPhoneNumbers(deps(response), "t1")).toEqual({ ok: false, reason: "unavailable" });
    expect(logged(error)).toEqual([`HighLevel phone read failed: ${line}`]);
    expect(logged(error).join(" ")).not.toMatch(/secret|\+1555/);
  });
});
