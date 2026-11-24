import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettingsValues, type LoadStatus } from "@/features/settings";

// Requirements 5 and 6: "not connected", "read failed" and "HighLevel answered with nothing" must be
// told apart, so only a real failure says "did not load". Made-up values only.
afterEach(() => vi.restoreAllMocks());

async function load(tenantId: string | null, read: (t: string) => Promise<{ key: string; value: string | null }[]>) {
  let status: LoadStatus | undefined;
  const values = await loadSettingsValues(tenantId, read, undefined, (s) => { status = s; });
  return { values, status };
}

describe("loadSettingsValues: the status of the read", () => {
  it("is ok for a blank account, with every key as an empty field", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await load("t1", async () => [{ key: "business_name", value: "" }, { key: "main_color", value: null }]);
    expect(out).toEqual({ values: { business_name: "", main_color: "" }, status: "ok" });
  });

  it("is empty when HighLevel answers with no rows", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await load("t1", async () => [])).toEqual({ values: {}, status: "empty" });
  });

  it("is empty when no row is a key Settings shows", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await load("t1", async () => [{ key: "0_x", value: "y" }])).toEqual({ values: {}, status: "empty" });
  });

  it("is failed when the read throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await load("t1", async () => { throw new Error("down"); })).toEqual({ values: {}, status: "failed" });
  });

  it("is not-connected when the reader says so, and logs only that step", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const notConnected = Object.assign(new Error("secret detail"), { code: "not-connected" });
    expect(await load("t1", async () => { throw notConnected; })).toEqual({ values: {}, status: "not-connected" });
    expect(error.mock.calls.map((c) => String(c[0]))).toEqual(["Settings values did not load: step=not-connected"]);
  });

  it("is not-connected without a tenant, and reads nothing", async () => {
    const read = vi.fn();
    expect(await load(null, read)).toEqual({ values: {}, status: "not-connected" });
    expect(read).not.toHaveBeenCalled();
  });
});
