import { describe, expect, it, vi } from "vitest";
import { TokenServiceError } from "../../../src/features/highlevel/api/token-service";
import { buildPhoneNumbersReader, createPhoneNumberRequests, parsePhoneNumbers, readPhoneNumbers } from "../../../src/features/highlevel/api/phone-numbers";

// Made-up values only.
const row = (over: Record<string, unknown> = {}) => ({ phoneNumber: "+15550100000", friendlyName: "Main", capabilities: { sms: true, voice: true }, ...over });
const body = (numbers: unknown[], over: Record<string, unknown> = {}) => ({ numbers, accountStatus: "active", page: 0, pageSize: 1000, isUnderGhl: true, ...over });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const deps = (response: Response | Error) => ({
  readLocationId: vi.fn(async () => "loc_1" as string | null),
  withToken: vi.fn(async (_t: string, call: (token: string) => Promise<Response>) => call("token")),
  requests: { list: vi.fn(async () => { if (response instanceof Error) throw response; return response; }) },
});

describe("phone number request", () => {
  it("is a read of the location's numbers that never follows a redirect", async () => {
    const doFetch = vi.fn<typeof fetch>(async () => json(body([])));
    await createPhoneNumberRequests("https://api.test/", doFetch).list("token", "loc/1");
    const [url, init] = doFetch.mock.calls[0];
    expect(String(url)).toBe("https://api.test/phone-system/numbers/location/loc%2F1?pageSize=1000&page=0");
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect((init?.headers as Record<string, string>).version).toBe("v3");
  });
});

describe("parsePhoneNumbers", () => {
  it("keeps only SMS-capable numbers and only the number and its name", () => {
    const out = parsePhoneNumbers(body([row({ sid: "secret-sid" }), row({ phoneNumber: "+15550100001", capabilities: { sms: false } }), row({ phoneNumber: "+15550100002", capabilities: {} })]));
    expect(out.numbers).toEqual([{ number: "+15550100000", name: "Main" }]);
    expect(JSON.stringify(out)).not.toContain("secret-sid");
  });

  it("flags a full page as possibly incomplete", () => {
    expect(parsePhoneNumbers(body([row()], { pageSize: 1 })).complete).toBe(false);
    expect(parsePhoneNumbers(body([row()])).complete).toBe(true);
  });

  it("refuses a body without a list", () => {
    expect(() => parsePhoneNumbers({ numbers: "x" })).toThrow();
  });
});

describe("readPhoneNumbers", () => {
  it("returns the numbers", async () => {
    expect(await readPhoneNumbers(deps(json(body([row()]))), "t1")).toEqual({ ok: true, numbers: [{ number: "+15550100000", name: "Main" }], complete: true });
  });

  it.each([[401, "no-access"], [403, "no-access"], [404, "not-connected"], [500, "unavailable"], [429, "unavailable"]])("maps %i to %s", async (status, reason) => {
    expect(await readPhoneNumbers(deps(json({ message: "x" }, status)), "t1")).toEqual({ ok: false, reason });
  });

  it("does not list numbers of an account that is not active", async () => {
    expect(await readPhoneNumbers(deps(json(body([row()], { accountStatus: "suspended" }))), "t1")).toEqual({ ok: false, reason: "inactive" });
  });

  it("answers unavailable on a token failure and a bad body, not-connected without a location", async () => {
    expect(await readPhoneNumbers(deps(new TokenServiceError("unavailable")), "t1")).toEqual({ ok: false, reason: "unavailable" });
    expect(await readPhoneNumbers(deps(new Response("not json")), "t1")).toEqual({ ok: false, reason: "unavailable" });
    const none = { ...deps(json(body([]))), readLocationId: vi.fn(async () => null) };
    expect(await readPhoneNumbers(none, "t1")).toEqual({ ok: false, reason: "not-connected" });
  });
});

describe("the limited reader", () => {
  it("makes no call when the limiter refuses or fails", async () => {
    const runtime = vi.fn();
    expect(await buildPhoneNumbersReader(runtime, async () => false)("t1")).toEqual({ ok: false, reason: "unavailable" });
    expect(await buildPhoneNumbersReader(runtime, async () => { throw new Error("down"); })("t1")).toEqual({ ok: false, reason: "unavailable" });
    expect(runtime).not.toHaveBeenCalled();
  });

  it("counts a client view against the viewer and uses the stored token", async () => {
    const hit = vi.fn<(key: string) => Promise<boolean>>(async () => true);
    const stored = vi.fn(async (_t: string, call: (token: string) => Promise<Response>) => call("stored"));
    const own = vi.fn();
    const list = vi.fn(async () => json(body([])));
    await buildPhoneNumbersReader(() => ({ readLocationId: async () => "loc_1", withLocationToken: own, withStoredLocationToken: stored, requests: { list } }), hit, { viewerId: "admin_1" })("t1");
    expect(hit.mock.calls[0][0]).toBe("highlevel-phone-numbers-view:admin_1");
    expect(stored).toHaveBeenCalled();
    expect(own).not.toHaveBeenCalled();
  });
});
