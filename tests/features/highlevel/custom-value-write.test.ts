import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HighLevelHttpError, TokenServiceError, createCustomValueAdapter, createHighLevelClient, parseCustomValueDetails,
} from "@/features/highlevel";

// Mocked HighLevel only. All values are fake.
const config = { baseUrl: "https://hl.example.test/", appId: "a", clientId: "c", clientSecret: "s", redirectUri: "https://x.test/cb" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const row = (over: Record<string, unknown> = {}) => ({ id: "v1", name: "Main color", fieldKey: "{{ custom_values.main_color }}", value: "#111111", locationId: "loc-a", ...over });
const detail = { id: "v1", key: "main_color", name: "Main color", value: "#111111" };

function adapter(over: Partial<Parameters<typeof createCustomValueAdapter>[0]> = {}) {
  return createCustomValueAdapter({
    readLocationId: async () => "loc-a",
    getLocationToken: async () => "token",
    requestList: async () => json({ customValues: [row()] }),
    requestUpdate: async () => json({ customValue: row() }),
    ...over,
  });
}

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => { errorLog = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { errorLog.mockRestore(); });

describe("the HighLevel custom value update request", () => {
  it("sends the documented PUT with name and value", async () => {
    const doFetch = vi.fn<typeof fetch>(async () => json({}));
    const client = createHighLevelClient({ ...config, fetch: doFetch as unknown as typeof fetch });
    await client.requestUpdateCustomValue("tok", "loc/a", "v 1", { name: "Main color", value: "#222222" });
    const [url, init] = doFetch.mock.calls[0];
    expect(url).toBe("https://hl.example.test/locations/loc%2Fa/customValues/v%201");
    expect(init?.method).toBe("PUT");
    expect(init?.headers).toMatchObject({ authorization: "Bearer tok", version: "2021-07-28", "content-type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Main color", value: "#222222" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("reports an unreachable HighLevel with no status", async () => {
    const client = createHighLevelClient({ ...config, fetch: (async () => { throw new Error("down"); }) as unknown as typeof fetch });
    await expect(client.requestUpdateCustomValue("t", "l", "v", { name: "n", value: "x" })).rejects.toBeInstanceOf(HighLevelHttpError);
  });
});

describe("parseCustomValueDetails", () => {
  it("keeps the id, key, name and value", () => {
    expect(parseCustomValueDetails({ customValues: [row()] }, "loc-a")).toEqual([detail]);
  });

  it("drops a row of another location", () => {
    expect(parseCustomValueDetails({ customValues: [row({ locationId: "loc-b" })] }, "loc-a")).toEqual([]);
  });

  it("drops both rows when a key appears twice, because the target is ambiguous", () => {
    expect(parseCustomValueDetails({ customValues: [row(), row({ id: "v2" })] }, "loc-a")).toEqual([]);
  });

  it("reads a missing value as empty and needs an id and a name", () => {
    expect(parseCustomValueDetails({ customValues: [row({ value: null })] }, "loc-a")[0].value).toBe("");
    expect(parseCustomValueDetails({ customValues: [row({ id: undefined }), row({ name: "" })] }, "loc-a")).toEqual([]);
  });

  it("throws on an answer without a list", () => {
    expect(() => parseCustomValueDetails({}, "loc-a")).toThrow();
  });
});

describe("the adapter", () => {
  it("reads the tenant's values with its location", async () => {
    const requestList = vi.fn(async () => json({ customValues: [row()] }));
    expect(await adapter({ requestList }).read("t")).toEqual({ ok: true, values: [detail] });
    expect(requestList).toHaveBeenCalledWith("token", "loc-a");
  });

  it("keeps the existing name when it updates a value", async () => {
    const requestUpdate = vi.fn(async () => json({}));
    expect(await adapter({ requestUpdate }).update("t", detail, "#222222")).toBe("saved");
    expect(requestUpdate).toHaveBeenCalledWith("token", "loc-a", "v1", { name: "Main color", value: "#222222" });
  });

  it.each([
    [400, "rejected"], [422, "rejected"], [401, "permission"], [403, "permission"], [404, "retry"], [429, "retry"], [500, "retry"], [503, "retry"],
  ] as const)("maps status %i to %s", async (status, outcome) => {
    expect(await adapter({ requestUpdate: async () => json({}, status) }).update("t", detail, "x")).toBe(outcome);
  });

  it("calls the update once on a failure", async () => {
    const requestUpdate = vi.fn(async () => json({}, 500));
    await adapter({ requestUpdate }).update("t", detail, "x");
    expect(requestUpdate).toHaveBeenCalledTimes(1);
  });

  it("maps a token failure", async () => {
    const failing = (code: "unavailable" | "needs_reconnect") => adapter({ getLocationToken: async () => { throw new TokenServiceError(code); } });
    expect(await failing("unavailable").update("t", detail, "x")).toBe("retry");
    expect(await failing("needs_reconnect").update("t", detail, "x")).toBe("permission");
  });

  it("answers permission when the tenant has no location", async () => {
    expect(await adapter({ readLocationId: async () => null }).read("t")).toEqual({ ok: false, reason: "permission" });
    expect(await adapter({ readLocationId: async () => null }).update("t", detail, "x")).toBe("permission");
  });

  it("answers retry on an unreadable list", async () => {
    expect(await adapter({ requestList: async () => new Response("nope") }).read("t")).toEqual({ ok: false, reason: "retry" });
  });

  it("does not force a token refresh when a write answers 401", async () => {
    const getLocationToken = vi.fn(async () => "token");
    const requestUpdate = vi.fn(async () => json({}, 401));
    expect(await adapter({ getLocationToken, requestUpdate }).update("t", detail, "x")).toBe("permission");
    expect(getLocationToken).toHaveBeenCalledTimes(1);
    expect(getLocationToken).toHaveBeenCalledWith("t");
    expect(requestUpdate).toHaveBeenCalledTimes(1);
  });

  it("never logs a value", async () => {
    await adapter({ requestUpdate: async () => json({}, 500) }).update("t", detail, "secret-new-value");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret-new-value");
  });
});
