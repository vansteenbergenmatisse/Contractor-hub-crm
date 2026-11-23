import { describe, expect, it, vi } from "vitest";
import { createBrandService } from "@/features/brand";

const owner = (value: string) => [{ key: "business_owner_name", value }];
const START = Date.parse("2026-11-23T10:00:00.000Z");
const TTL = 300_000;

function setup() {
  let now = START;
  let version: string | null = null;
  let held = "Old Name";
  let stored: string | null = "Old Name";
  const fetchValues = vi.fn(async () => owner(held));
  const service = createBrandService({
    fetchValues,
    readStoredValues: async () => (stored === null ? null : owner(stored)),
    readVersion: async () => version,
    now: () => now,
    ttlMs: TTL,
  });
  return {
    service,
    fetchValues,
    advance: (ms: number) => (now += ms),
    bump: () => (version = new Date(now).toISOString()),
    hold: (value: string) => (held = value),
    store: (value: string | null) => (stored = value),
  };
}

describe("brand cache just after a save", () => {
  it("picks up a write that lands after the version bump within seconds, not after the full ttl", async () => {
    const t = setup();
    await t.service.getValues("t1");
    t.bump();
    // HighLevel still answers with the old value on the first read after the bump.
    expect(await t.service.getValues("t1")).toEqual(owner("Old Name"));
    t.hold("New Name");
    t.advance(4_999);
    expect(await t.service.getValues("t1")).toEqual(owner("Old Name"));
    t.advance(1);
    expect(await t.service.getValues("t1")).toEqual(owner("New Name"));
  });

  it("uses the short life on the read-only path too", async () => {
    const t = setup();
    await t.service.getValuesReadOnly("t1");
    t.bump();
    await t.service.getValuesReadOnly("t1");
    t.store("New Name");
    t.advance(5_000);
    expect(await t.service.getValuesReadOnly("t1")).toEqual(owner("New Name"));
  });

  it("returns to the full ttl once the version is a minute old", async () => {
    const t = setup();
    t.bump();
    t.advance(60_000);
    await t.service.getValues("t1");
    t.advance(TTL - 1);
    await t.service.getValues("t1");
    expect(t.fetchValues).toHaveBeenCalledTimes(1);
  });

  it("keeps the full ttl for a tenant that never saved", async () => {
    const t = setup();
    await t.service.getValues("t1");
    t.advance(TTL - 1);
    await t.service.getValues("t1");
    expect(t.fetchValues).toHaveBeenCalledTimes(1);
  });
});

describe("last-good values for the read-only paths", () => {
  it("survive a version bump when the stored token cannot be used", async () => {
    const t = setup();
    await t.service.getValues("t1");
    t.bump();
    t.store(null);
    expect(await t.service.getValuesReadOnly("t1")).toEqual(owner("Old Name"));
    expect((await t.service.getBrandReadOnly("t1")).profile.owner).toBe("Old Name");
    expect(t.fetchValues).toHaveBeenCalledTimes(1);
  });

  it("survive the saving instance's own expire", async () => {
    const t = setup();
    await t.service.getValues("t1");
    t.service.expire("t1");
    t.store(null);
    expect(await t.service.getValuesReadOnly("t1")).toEqual(owner("Old Name"));
  });

  it("are replaced by a newer successful read", async () => {
    const t = setup();
    await t.service.getValues("t1");
    t.bump();
    t.store("New Name");
    await t.service.getValuesReadOnly("t1");
    t.advance(5_000);
    t.bump();
    t.store(null);
    expect(await t.service.getValuesReadOnly("t1")).toEqual(owner("New Name"));
  });

  it("are not shown after an explicit invalidate", async () => {
    const t = setup();
    await t.service.getValues("t1");
    t.bump();
    await t.service.getValues("t1");
    t.service.invalidate("t1");
    t.store(null);
    await expect(t.service.getValuesReadOnly("t1")).rejects.toThrow();
  });

  it("never reach another tenant", async () => {
    const t = setup();
    await t.service.getValues("t1");
    t.bump();
    t.store(null);
    await expect(t.service.getValuesReadOnly("t2")).rejects.toThrow();
  });
});
