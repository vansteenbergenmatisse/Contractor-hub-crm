import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePhoneNumbers, readPhoneNumbers } from "../../../src/features/highlevel/api/phone-numbers";

// Made-up values only. The v3 answer wraps the list in `data`; the older one is flat. Both are read.
const row = (over: Record<string, unknown> = {}) => ({ phoneNumber: "+15550100000", friendlyName: "Main", capabilities: { sms: true }, ...over });
const inner = (numbers: unknown[], over: Record<string, unknown> = {}) => ({ numbers, isUnderLc: false, pageSize: 1000, page: 0, accountStatus: "active", total: numbers.length, rcsSenderIds: [], ...over });
const wrapped = (numbers: unknown[], over: Record<string, unknown> = {}) => ({ status: "success", data: inner(numbers, over), message: "ok", statusCode: 200 });
const deps = (value: unknown) => ({
  readLocationId: vi.fn(async () => "loc_1" as string | null),
  withToken: vi.fn(async (_t: string, call: (token: string) => Promise<Response>) => call("token")),
  requests: { list: vi.fn(async () => new Response(JSON.stringify(value), { status: 200 })) },
});

afterEach(() => vi.restoreAllMocks());

describe("parsePhoneNumbers with the v3 wrapped answer", () => {
  it("reads the numbers inside data", () => {
    const out = parsePhoneNumbers(wrapped([row(), row({ phoneNumber: "+15550100001", capabilities: { sms: false } })]));
    expect(out).toEqual({ numbers: [{ number: "+15550100000", name: "Main" }], complete: true });
  });

  it("takes pageSize from data", () => {
    expect(parsePhoneNumbers(wrapped([row()], { pageSize: 1 })).complete).toBe(false);
  });

  it("reads an empty data.numbers as no numbers", async () => {
    expect(parsePhoneNumbers(wrapped([]))).toEqual({ numbers: [], complete: true });
    expect(await readPhoneNumbers(deps(wrapped([])), "t1")).toEqual({ ok: true, numbers: [], complete: true });
  });

  it("answers inactive for an inactive data.accountStatus", async () => {
    expect(await readPhoneNumbers(deps(wrapped([row()], { accountStatus: "suspended" })), "t1")).toEqual({ ok: false, reason: "inactive" });
  });

  it("takes accountStatus from data, else from the top level", async () => {
    const top = (status: string, dataStatus?: string) => {
      const d: Record<string, unknown> = inner([row()]);
      if (dataStatus === undefined) delete d.accountStatus;
      else d.accountStatus = dataStatus;
      return { status: "success", accountStatus: status, data: d };
    };
    expect(await readPhoneNumbers(deps(top("active", "suspended")), "t1")).toEqual({ ok: false, reason: "inactive" });
    expect(await readPhoneNumbers(deps(top("suspended", "active")), "t1")).toMatchObject({ ok: true });
    expect(await readPhoneNumbers(deps(top("suspended")), "t1")).toEqual({ ok: false, reason: "inactive" });
    expect(await readPhoneNumbers(deps(top("active")), "t1")).toMatchObject({ ok: true });
  });

  it("refuses a data object without a numbers list, naming the top-level keys", () => {
    expect(() => parsePhoneNumbers({ status: "success", data: { items: [] } })).toThrow(/no-numbers-list keys=status,data/);
  });
});

describe("parsePhoneNumbers with the flat answer", () => {
  it("still reads it", async () => {
    expect(parsePhoneNumbers({ numbers: [row()], total: 1 })).toEqual({ numbers: [{ number: "+15550100000", name: "Main" }], complete: true });
    expect(await readPhoneNumbers(deps({ numbers: [], total: 0 }), "t1")).toEqual({ ok: true, numbers: [], complete: true });
  });

  it("still refuses something that is not an object", () => {
    expect(() => parsePhoneNumbers([1])).toThrow(/not-object/);
  });
});
