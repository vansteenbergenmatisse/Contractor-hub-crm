import { describe, expect, it, vi } from "vitest";
import { createBrandService } from "@/features/brand";

const owner = (value: string) => [{ key: "business_owner_name", value }];

// Two server instances: separate memory, one shared version (the database).
function twoInstances() {
  let version: string | null = null;
  let stored = "Old Name";
  const fetchValues = vi.fn(async () => owner(stored));
  const make = () => createBrandService({ fetchValues, readVersion: async () => version, now: () => 1_000, ttlMs: 300_000 });
  return {
    a: make(),
    b: make(),
    fetchValues,
    write: (value: string, nextVersion: string) => {
      stored = value;
      version = nextVersion;
    },
  };
}

describe("brand cache across server instances", () => {
  it("keeps using the cache while the version is the same", async () => {
    const { a, fetchValues } = twoInstances();
    await a.getValues("t1");
    await a.getValues("t1");
    expect(fetchValues).toHaveBeenCalledTimes(1);
  });

  it("shows a save made on another instance on the next read, inside the ttl", async () => {
    const { a, b, write } = twoInstances();
    await a.getValues("t1");
    await b.getValues("t1");
    write("New Name", "2026-11-23T10:00:00.000Z");
    expect(await b.getValues("t1")).toEqual(owner("New Name"));
    expect((await a.getBrand("t1")).profile.owner).toBe("New Name");
  });

  it("also refreshes the read-only paths", async () => {
    const fetchValues = vi.fn(async () => owner("Old Name"));
    let stored = "Old Name";
    let version: string | null = null;
    const service = createBrandService({
      fetchValues,
      readStoredValues: async () => owner(stored),
      readVersion: async () => version,
      now: () => 1_000,
      ttlMs: 300_000,
    });
    await service.getValuesReadOnly("t1");
    stored = "New Name";
    version = "v2";
    expect(await service.getValuesReadOnly("t1")).toEqual(owner("New Name"));
    expect((await service.getBrandReadOnly("t1")).profile.owner).toBe("New Name");
  });

  it("does not let one tenant's version clear another tenant", async () => {
    const versions: Record<string, string> = { t1: "1", t2: "1" };
    const fetchValues = vi.fn(async (tenantId: string) => owner(tenantId));
    const service = createBrandService({ fetchValues, readVersion: async (id) => versions[id], now: () => 1_000, ttlMs: 300_000 });
    await service.getValues("t1");
    await service.getValues("t2");
    versions.t1 = "2";
    await service.getValues("t1");
    await service.getValues("t2");
    expect(fetchValues.mock.calls.map(([id]) => id)).toEqual(["t1", "t2", "t1"]);
  });

  it("falls back to the cache when the version cannot be read", async () => {
    const readVersion = vi.fn<(id: string) => Promise<string | null>>().mockResolvedValueOnce("1").mockRejectedValue(new Error("down"));
    const fetchValues = vi.fn(async () => owner("Name"));
    const service = createBrandService({ fetchValues, readVersion, now: () => 1_000, ttlMs: 300_000 });
    await service.getValues("t1");
    expect(await service.getValues("t1")).toEqual(owner("Name"));
    expect(fetchValues).toHaveBeenCalledTimes(1);
  });
});
