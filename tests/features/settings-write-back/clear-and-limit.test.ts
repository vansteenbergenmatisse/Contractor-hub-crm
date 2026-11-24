import { describe, expect, it, vi } from "vitest";
import { SAVES_PER_HOUR_PER_TENANT, SAVES_PER_HOUR_PER_USER, handleSaveValues } from "../../../src/features/settings-write-back/api/save-route";
import { saveCustomValues, type SaveDeps } from "../../../src/features/settings-write-back/api/write-back";

// Made-up values only.
const row = (key: string, value: string) => ({ id: `id-${key}`, key, name: key, value });
function saveDeps(initial: Record<string, string>) {
  const held = { ...initial };
  const begin = vi.fn(async () => "audit");
  const finish = vi.fn(async () => {});
  const update = vi.fn(async (_t: string, target: { key: string }, value: string) => { held[target.key] = value; return "saved" as const; });
  const deps: SaveDeps = {
    read: async () => ({ ok: true, values: Object.entries(held).map(([k, v]) => row(k, v)) }),
    update, begin, finish, invalidate: () => {}, claim: async () => "lease", release: async () => {}, now: () => 0,
  };
  return { deps, update, begin, finish, held };
}
const input = (changes: { key: string; expected: string; value: string; clear?: true }[]) => ({ tenantId: "t1", actorId: "u1", changes });

describe("clearing a value", () => {
  it("clears a non-required value only when marked, with the same audit", async () => {
    const { deps, begin, finish, held } = saveDeps({ seasonal_offer_text: "Old" });
    const { results } = await saveCustomValues(input([{ key: "seasonal_offer_text", expected: "Old", value: "", clear: true }]), deps);
    expect(results).toEqual([{ key: "seasonal_offer_text", status: "saved" }]);
    expect(held.seasonal_offer_text).toBe("");
    expect(begin).toHaveBeenCalledWith({ tenantId: "t1", actorId: "u1", key: "seasonal_offer_text", previousValue: "Old", newValue: "" });
    expect(finish).toHaveBeenCalledWith("audit", "saved");
  });

  it("refuses an empty value without the mark", async () => {
    const { deps, update } = saveDeps({ seasonal_offer_text: "Old" });
    const { results } = await saveCustomValues(input([{ key: "seasonal_offer_text", expected: "Old", value: "" }]), deps);
    expect(results[0].status).toBe("invalid");
    expect(update).not.toHaveBeenCalled();
  });

  it("never clears the required business name", async () => {
    const { deps, update } = saveDeps({ business_name: "Test Co" });
    const { results } = await saveCustomValues(input([{ key: "business_name", expected: "Test Co", value: "", clear: true }]), deps);
    expect(results[0].status).toBe("invalid");
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a clear mark on a value that is not empty", async () => {
    const { deps, update } = saveDeps({ seasonal_offer_text: "Old" });
    const { results } = await saveCustomValues(input([{ key: "seasonal_offer_text", expected: "Old", value: "New", clear: true }]), deps);
    expect(results[0].status).toBe("invalid");
    expect(update).not.toHaveBeenCalled();
  });

  it("does not clear a value that changed in the account meanwhile", async () => {
    const { deps, update } = saveDeps({ seasonal_offer_text: "Newer" });
    const { results } = await saveCustomValues(input([{ key: "seasonal_offer_text", expected: "Old", value: "", clear: true }]), deps);
    expect(results[0]).toEqual({ key: "seasonal_offer_text", status: "conflict", current: "Newer" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("the save route", () => {
  const route = (changes: unknown) => {
    const save = vi.fn(async () => ({ results: [] }));
    const request = new Request("https://app.test/api/settings/values", { method: "POST", headers: { origin: "https://app.test" }, body: JSON.stringify({ changes }) });
    const answer = handleSaveValues(request, { appOrigin: "https://app.test", currentUser: async () => ({ id: "u1", role: "owner" as const, tenantId: "t1" }), isEnabled: () => true, hit: async () => true, save });
    return { save, answer };
  };

  it("allows 40 saves per user per hour and leaves the tenant limit as it was", () => {
    expect(SAVES_PER_HOUR_PER_USER).toBe(40);
    expect(SAVES_PER_HOUR_PER_TENANT).toBe(30);
  });

  it("passes an explicit clear on", async () => {
    const change = { key: "seasonal_offer_text", expected: "Old", value: "", clear: true };
    const { save, answer } = route([change]);
    expect((await answer).status).toBe(200);
    expect(save).toHaveBeenCalledWith({ tenantId: "t1", actorId: "u1", changes: [change] });
  });

  it.each([
    ["clear false", { key: "a", expected: "b", value: "", clear: false }],
    ["clear as text", { key: "a", expected: "b", value: "", clear: "true" }],
    ["clear with a value", { key: "a", expected: "b", value: "c", clear: true }],
    ["clear with another field", { key: "a", expected: "b", value: "", clear: true, tenantId: "x" }],
  ])("refuses %s", async (_name, change) => {
    const { save, answer } = route([change]);
    expect((await answer).status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
});
