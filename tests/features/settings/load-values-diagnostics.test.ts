import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSettingsValues } from "../../../src/features/settings/api/load-values";

// Bug 2026-11-24: Settings said "Your details did not load" for a new sub-account and no log said
// whether the read failed, came back empty, or held no key Settings shows. Counts only, never values.
afterEach(() => vi.restoreAllMocks());

const logged = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((call) => String(call[0]));

describe("loadSettingsValues: says why the page has nothing to show", () => {
  it("logs a failed read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadSettingsValues("t1", async () => { throw new Error("secret detail"); })).toEqual({});
    expect(logged(error)).toEqual(["Settings values did not load: step=read"]);
  });

  it("logs an empty read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadSettingsValues("t1", async () => [])).toEqual({});
    expect(logged(error)).toEqual(["Settings values did not load: step=empty rows=0"]);
  });

  it("logs a read where no row is a key Settings shows", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const rows = [{ key: "secret_webhook_url", value: "https://secret.test" }, { key: "business_full_address", value: null }, { key: "x", value: "y" }];
    expect(await loadSettingsValues("t1", async () => rows)).toEqual({ business_full_address: "" });
    expect(error).not.toHaveBeenCalled();
    expect(await loadSettingsValues("t1", async () => rows.filter((r) => r.key !== "business_full_address"))).toEqual({});
    expect(logged(error)).toEqual(["Settings values did not load: step=none-allowed rows=2"]);
    expect(logged(error).join(" ")).not.toMatch(/secret/);
  });
});
