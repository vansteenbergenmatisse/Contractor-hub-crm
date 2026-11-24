import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrandService } from "@/features/brand";

// Made-up values only. A sub-account still importing its snapshot can answer with no custom values.
// That answer is cached, but only briefly (30s, or less when the normal TTL is shorter), so a
// tenant whose values really are empty does not call HighLevel on every request.
type Value = { key: string; value: string };
const values: Value[] = [{ key: "main_color", value: "#123456" }];
type Fetch = (tenantId: string) => Promise<Value[]>;
type Stored = (tenantId: string) => Promise<Value[] | null>;

function setup(deps: {
  fetchValues?: (tenantId: string) => Promise<Value[]>;
  readStoredValues?: (tenantId: string) => Promise<Value[] | null>;
  ttlMs?: number;
}) {
  let now = 1_000_000;
  const fetchValues = vi.fn(deps.fetchValues ?? (async () => values));
  const service = createBrandService({ fetchValues, readStoredValues: deps.readStoredValues, now: () => now, ttlMs: deps.ttlMs ?? 300_000 });
  return { service, fetchValues, advance: (ms: number) => (now += ms) };
}

afterEach(() => vi.restoreAllMocks());

describe("brand service with an empty custom-values list (getValues)", () => {
  it("serves the empty list from cache within 30s", async () => {
    const fetchValues = vi.fn<Fetch>().mockResolvedValueOnce([]).mockResolvedValue(values);
    const { service, advance } = setup({ fetchValues });
    expect(await service.getValues("t1")).toEqual([]);
    advance(29_999);
    expect(await service.getValues("t1")).toEqual([]);
    expect(fetchValues).toHaveBeenCalledTimes(1);
  });

  it("reads again after 30s and caches a non-empty answer for the full TTL", async () => {
    const fetchValues = vi.fn<Fetch>().mockResolvedValueOnce([]).mockResolvedValue(values);
    const { service, advance } = setup({ fetchValues });
    await service.getValues("t1");
    advance(30_000);
    expect(await service.getValues("t1")).toEqual(values);
    advance(299_999);
    expect(await service.getValues("t1")).toEqual(values);
    expect(fetchValues).toHaveBeenCalledTimes(2);
    advance(1);
    await service.getValues("t1");
    expect(fetchValues).toHaveBeenCalledTimes(3);
  });

  it("never keeps an empty list longer than a shorter normal TTL", async () => {
    const fetchValues = vi.fn<Fetch>().mockResolvedValue([]);
    const { service, advance } = setup({ fetchValues, ttlMs: 10_000 });
    await service.getValues("t1");
    advance(10_000);
    await service.getValues("t1");
    expect(fetchValues).toHaveBeenCalledTimes(2);
  });

  it("does not cache an empty read that was in flight when invalidate ran", async () => {
    let release: (v: Value[]) => void = () => {};
    const fetchValues = vi
      .fn<Fetch>()
      .mockImplementationOnce(() => new Promise<Value[]>((resolve) => (release = resolve)))
      .mockResolvedValue(values);
    const { service } = setup({ fetchValues });
    const first = service.getValues("t1");
    service.invalidate("t1");
    release([]);
    expect(await first).toEqual([]);
    expect(await service.getValues("t1")).toEqual(values);
    expect(fetchValues).toHaveBeenCalledTimes(2);
  });

  it("keeps a cached empty list as the last good values after expire (a tenant that cleared its values)", async () => {
    const readStoredValues = vi.fn<Stored>().mockResolvedValue(null);
    const fetchValues = vi.fn<Fetch>().mockResolvedValue([]);
    const { service } = setup({ fetchValues, readStoredValues });
    await service.getValues("t1");
    service.expire("t1");
    expect(await service.getValuesReadOnly("t1")).toEqual([]);
  });
});

describe("brand service with an empty custom-values list (getValuesReadOnly)", () => {
  it("serves the empty list from cache within 30s", async () => {
    const readStoredValues = vi.fn<Stored>().mockResolvedValueOnce([]).mockResolvedValue(values);
    const { service, advance } = setup({ readStoredValues });
    expect(await service.getValuesReadOnly("t1")).toEqual([]);
    advance(29_999);
    expect(await service.getValuesReadOnly("t1")).toEqual([]);
    expect(readStoredValues).toHaveBeenCalledTimes(1);
  });

  it("reads again after 30s and caches a non-empty answer for the full TTL", async () => {
    const readStoredValues = vi.fn<Stored>().mockResolvedValueOnce([]).mockResolvedValue(values);
    const { service, advance } = setup({ readStoredValues });
    await service.getValuesReadOnly("t1");
    advance(30_000);
    expect(await service.getValuesReadOnly("t1")).toEqual(values);
    advance(299_999);
    expect(await service.getValuesReadOnly("t1")).toEqual(values);
    expect(readStoredValues).toHaveBeenCalledTimes(2);
  });

  it("does not cache an empty read-only read that was in flight when invalidate ran", async () => {
    let release: (v: Value[] | null) => void = () => {};
    const readStoredValues = vi
      .fn<Stored>()
      .mockImplementationOnce(() => new Promise<Value[] | null>((resolve) => (release = resolve)))
      .mockResolvedValue(values);
    const { service } = setup({ readStoredValues });
    const first = service.getValuesReadOnly("t1");
    await Promise.resolve();
    service.invalidate("t1");
    release([]);
    expect(await first).toEqual([]);
    expect(await service.getValuesReadOnly("t1")).toEqual(values);
    expect(readStoredValues).toHaveBeenCalledTimes(2);
  });
});


describe("brand service read-only stored read failure", () => {
  it("logs the step only, never the error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const readStoredValues = vi.fn<Stored>().mockRejectedValue(new Error("decrypt failed for tok_secret loc_1"));
    const { service } = setup({ readStoredValues });
    await expect(service.getValuesReadOnly("t1")).rejects.toThrow();
    expect(log.mock.calls).toEqual([["Brand values read (read-only) failed: step=stored-read"]]);
  });

  it("does not log when the stored read answers", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { service } = setup({ readStoredValues: vi.fn<Stored>().mockResolvedValue(values) });
    await service.getValuesReadOnly("t1");
    expect(log).not.toHaveBeenCalled();
  });
});
