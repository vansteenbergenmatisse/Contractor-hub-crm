import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePhoneNumbers, readPhoneNumbers } from "../../../src/features/highlevel/api/phone-numbers";

// Requirement 6: a location with no phone numbers is a normal state. The live answer logged
// `keys=status,data,message,statusCode` with no numbers list. Field values here are made up.
afterEach(() => vi.restoreAllMocks());

const zero = { numbers: [], complete: true };
const deps = (body: unknown) => ({
  readLocationId: vi.fn(async () => "loc_1" as string | null),
  withToken: vi.fn(async (_t: string, call: (token: string) => Promise<Response>) => call("token")),
  requests: { list: vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) },
});

describe("parsePhoneNumbers: a location without numbers", () => {
  it("reads numbers: null as no numbers, flat or inside data", () => {
    expect(parsePhoneNumbers({ numbers: null })).toEqual(zero);
    expect(parsePhoneNumbers({ status: "success", data: { numbers: null } })).toEqual(zero);
  });

  it.each([
    ["null", null],
    ["an empty object", {}],
    ["an empty array", []],
  ])("reads data as %s, with no numbers key, as no numbers", (_label, data) => {
    expect(parsePhoneNumbers({ status: "success", data, message: "ok", statusCode: 200 })).toEqual(zero);
  });

  it("reads a 404 that says there are no numbers as no numbers", () => {
    expect(parsePhoneNumbers({ status: "error", data: { items: [1] }, message: "No phone numbers found for this location", statusCode: 404 })).toEqual(zero);
    expect(parsePhoneNumbers({ status: "error", data: null, message: "Numbers not found", statusCode: 404 })).toEqual(zero);
  });

  it("keeps a 401 or 403 in the body an error, never zero numbers", () => {
    expect(() => parsePhoneNumbers({ status: "error", data: null, message: "Unauthorized", statusCode: 401 })).toThrow();
    expect(() => parsePhoneNumbers({ status: "error", data: null, message: "No numbers", statusCode: 403 })).toThrow();
  });

  it("keeps a 404 with another message an error", () => {
    expect(() => parsePhoneNumbers({ status: "error", data: { items: [1] }, message: "Location gone", statusCode: 404 })).toThrow();
  });

  it("answers ok with no numbers through the reader, and logs nothing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readPhoneNumbers(deps({ status: "success", data: null, message: "ok", statusCode: 200 }), "t1")).toEqual({ ok: true, ...zero });
    expect(error).not.toHaveBeenCalled();
  });

  it("answers no-access for a 401 or 403 in the body, logging the status only", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readPhoneNumbers(deps({ status: "error", data: null, message: "secret text", statusCode: 403 }), "t1")).toEqual({ ok: false, reason: "no-access" });
    expect(error.mock.calls.map((c) => String(c[0]))).toEqual(["HighLevel phone read failed: step=parse detail=body-status status=403"]);
  });
});
