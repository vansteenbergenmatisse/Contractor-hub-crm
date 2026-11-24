import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleSaveValues, saveCustomValues, type SaveDeps } from "@/features/settings-write-back";

// Review fixes for feat/settings-every-value (2026-11-24): the server, not only the page, decides
// which shown keys a save may write. Mocked HighLevel and database only. All values are made up.
const detail = (key: string, value: string) => ({ id: `id-${key}`, key, name: `Name ${key}`, value });
const LONG = "x".repeat(2001);
const VALUES = [
  detail("business_name", "Test Co"), detail("brand_new_value", "Old"), detail("residentialservice1", "Mowing"),
  detail("residentialservice1content", "Old page text"), detail("bizarea1path", "areas/old"), detail("stray_pagecontent", "Old"),
  detail("seasonal_offer_text", LONG), detail("business_main_x", "sk_live_madeup123456"),
];

function deps() {
  const store = new Map(VALUES.map((row) => [row.key, { ...row }]));
  let audits = 0;
  return {
    store,
    read: vi.fn<SaveDeps["read"]>(async () => ({ ok: true, values: [...store.values()].map((row) => ({ ...row })) })),
    update: vi.fn<SaveDeps["update"]>(async (_tenant, target, value) => {
      (store.get(target.key) as { value: string }).value = value;
      return "saved";
    }),
    begin: vi.fn<SaveDeps["begin"]>(async () => `audit-${(audits += 1)}`),
    finish: vi.fn<SaveDeps["finish"]>(async () => {}),
    invalidate: vi.fn<SaveDeps["invalidate"]>(),
    claim: vi.fn<SaveDeps["claim"]>(async () => "holder"),
    release: vi.fn<SaveDeps["release"]>(async () => {}),
    now: vi.fn<SaveDeps["now"]>(() => 0),
  };
}
type Change = { key: string; expected: string; value: string; clear?: true };
const save = (d: SaveDeps, changes: Change[], unlocked?: string, tenantId = "T1") =>
  saveCustomValues({ tenantId, actorId: "U1", changes, ...(unlocked ? { unlocked } : {}) }, d);
const one = async (d: SaveDeps, change: Change, unlocked?: string) => (await save(d, [change], unlocked)).results[0];

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("protected folder keys on the server", () => {
  it.each([
    ["a page's text", { key: "residentialservice1content", expected: "Old page text", value: "", clear: true as const }],
    ["a service name", { key: "residentialservice1", expected: "Mowing", value: "Edging" }],
    ["an area slug", { key: "bizarea1path", expected: "areas/old", value: "areas/new" }],
  ])("refuses %s without the folder's unlock", async (_name, change) => {
    const d = deps();
    expect((await one(d, change)).status).toBe("denied");
    expect((await one(d, change, "area-other")).status).toBe("denied");
    expect(d.update).not.toHaveBeenCalled();
  });

  it("saves with the folder's unlock", async () => {
    const d = deps();
    expect((await one(d, { key: "residentialservice1", expected: "Mowing", value: "Edging" }, "res")).status).toBe("saved");
    expect((await one(d, { key: "bizarea1path", expected: "areas/old", value: "areas/new" }, "area")).status).toBe("saved");
  });

  it("refuses another folder's key in an unlocked save", async () => {
    const d = deps();
    expect((await one(d, { key: "bizarea1path", expected: "areas/old", value: "areas/new" }, "res")).status).toBe("denied");
  });

  it("never writes page text outside a protected folder", async () => {
    const d = deps();
    expect((await one(d, { key: "stray_pagecontent", expected: "Old", value: "New" })).status).toBe("denied");
    expect((await one(d, { key: "stray_pagecontent", expected: "Old", value: "New" }, "res")).status).toBe("denied");
  });

  it("still saves an ordinary shown key, also a new one", async () => {
    const d = deps();
    expect((await one(d, { key: "brand_new_value", expected: "Old", value: "New" })).status).toBe("saved");
  });

  it("keeps tenant isolation: a valid key with an unlock writes only the session's tenant", async () => {
    const d = deps();
    await save(d, [{ key: "residentialservice1", expected: "Mowing", value: "Edging" }], "res", "T2");
    expect(d.read).toHaveBeenCalledWith("T2");
    expect(d.update.mock.calls.every(([tenant]) => tenant === "T2")).toBe(true);
  });
});

describe("long and secret-looking values on the server", () => {
  it("refuses a long value and never sends it back", async () => {
    const d = deps();
    const result = await one(d, { key: "seasonal_offer_text", expected: "anything", value: "Short" });
    expect(result.status).toBe("denied");
    expect(result.current).toBeUndefined();
    expect(d.update).not.toHaveBeenCalled();
  });

  it("refuses a key whose current value looks secret, and never sends it back", async () => {
    const d = deps();
    const result = await one(d, { key: "business_main_x", expected: "", value: "x" });
    expect(result).toEqual({ key: "business_main_x", status: "denied" });
  });

  it("refuses writing a secret-looking value", async () => {
    const d = deps();
    expect((await one(d, { key: "brand_new_value", expected: "Old", value: "https://hooks.zapier.com/hooks/catch/1/a/" })).status).toBe("invalid");
    expect(d.update).not.toHaveBeenCalled();
  });
});

describe("the save route carries the unlock", () => {
  const ORIGIN = "https://app.test";
  const request = (body: unknown) => new Request(`${ORIGIN}/api/settings/values`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) });
  const routeDeps = () => ({
    appOrigin: ORIGIN,
    currentUser: vi.fn(async () => ({ id: "U1", role: "owner" as const, tenantId: "T1" })),
    isEnabled: vi.fn(() => true),
    hit: vi.fn(async () => true),
    save: vi.fn(async () => ({ results: [] })),
  });
  const changes = [{ key: "residentialservice1", expected: "Mowing", value: "Edging" }];

  it("passes a folder unlock on", async () => {
    const d = routeDeps();
    expect((await handleSaveValues(request({ changes, unlocked: "res" }), d)).status).toBe(200);
    expect(d.save).toHaveBeenCalledWith({ tenantId: "T1", actorId: "U1", changes, unlocked: "res" });
  });

  it.each([["a number", 5], ["an empty string", ""], ["odd characters", "res<x>"], ["a long id", "a".repeat(41)]])("refuses an unlock that is %s", async (_name, unlocked) => {
    const d = routeDeps();
    expect((await handleSaveValues(request({ changes, unlocked }), d)).status).toBe(400);
    expect(d.save).not.toHaveBeenCalled();
  });
});
