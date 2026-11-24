import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePhoneNumbers, readPhoneNumbers } from "../../../src/features/highlevel/api/phone-numbers";

// Review of fix/settings-blank-values: an answer that signals an error only in `status`, or with a
// string `statusCode`, must never read as "no numbers". Field values here are made up.
afterEach(() => vi.restoreAllMocks());

const zero = { numbers: [], complete: true };
const deps = (body: unknown) => ({
  readLocationId: vi.fn(async () => "loc_1" as string | null),
  withToken: vi.fn(async (_t: string, call: (token: string) => Promise<Response>) => call("token")),
  requests: { list: vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) },
});

describe("parsePhoneNumbers: error bodies with an empty data", () => {
  it.each([
    ["status 401 only", { status: 401, data: null, message: "Unauthorized" }],
    ["status 403 only", { status: 403, data: null, message: "Forbidden" }],
    ["string statusCode 401", { status: "error", data: null, message: "Unauthorized", statusCode: "401" }],
    ["string statusCode 403", { data: {}, statusCode: "403" }],
  ])("treats %s as an access error", async (_label, body) => {
    expect(() => parsePhoneNumbers(body)).toThrow();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readPhoneNumbers(deps(body), "t1")).toEqual({ ok: false, reason: "no-access" });
  });

  it.each([
    ["status error word, no statusCode", { status: "error", data: null, message: "Internal server error" }],
    ["string statusCode 500", { status: 500, data: {}, message: "x", statusCode: "500" }],
    ["status 500 only", { status: 500, data: [] }],
    ["status fail word", { status: "fail", data: {} }],
  ])("treats %s as an error, never zero numbers", async (_label, body) => {
    expect(() => parsePhoneNumbers(body)).toThrow();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readPhoneNumbers(deps(body), "t1")).toEqual({ ok: false, reason: "unavailable" });
  });

  it.each([
    ["no status at all", { data: null }],
    ["string statusCode 200", { data: {}, statusCode: "200" }],
    ["status ok word", { status: "ok", data: [] }],
    ["numeric status 200", { status: 200, data: null }],
  ])("still reads %s with an empty data as zero numbers", (_label, body) => {
    expect(parsePhoneNumbers(body)).toEqual(zero);
  });

  it("still reads a string 404 that says there are no numbers as zero numbers", () => {
    expect(parsePhoneNumbers({ status: "error", data: null, message: "No phone numbers found", statusCode: "404" })).toEqual(zero);
  });

  it("logs the body status only, never the message", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await readPhoneNumbers(deps({ status: 401, data: null, message: "secret text" }), "t1");
    expect(error.mock.calls.map((c) => String(c[0]))).toEqual(["HighLevel phone read failed: step=parse detail=body-status status=401"]);
  });
});
