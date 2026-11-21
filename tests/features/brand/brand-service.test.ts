import { describe, expect, it, vi } from "vitest";
import { createBrandService } from "@/features/brand";

const values = [{ key: "main_color", value: "#123456" }];

function setup(fetchValues = vi.fn().mockResolvedValue(values)) {
  let now = 1_000_000;
  const service = createBrandService({ fetchValues, now: () => now, ttlMs: 60_000 });
  return { service, fetchValues, advance: (ms: number) => (now += ms) };
}

describe("brand service", () => {
  it("fetches once per tenant inside the ttl", async () => {
    const { service, fetchValues } = setup();
    const a = await service.getBrand("t1");
    await service.getBrand("t1");
    expect(a.cssVars["--main-color"]).toBe("#123456");
    expect(fetchValues).toHaveBeenCalledTimes(1);
  });

  it("keeps tenants apart: another tenant triggers its own fetch with its own id", async () => {
    const { service, fetchValues } = setup();
    await service.getBrand("t1");
    await service.getBrand("t2");
    expect(fetchValues.mock.calls.map((c) => c[0])).toEqual(["t1", "t2"]);
  });

  it("fetches again after the ttl", async () => {
    const { service, fetchValues, advance } = setup();
    await service.getBrand("t1");
    advance(60_001);
    await service.getBrand("t1");
    expect(fetchValues).toHaveBeenCalledTimes(2);
  });

  it("invalidate drops one tenant only", async () => {
    const { service, fetchValues } = setup();
    await service.getBrand("t1");
    await service.getBrand("t2");
    service.invalidate("t1");
    await service.getBrand("t1");
    await service.getBrand("t2");
    expect(fetchValues).toHaveBeenCalledTimes(3);
  });

  it("returns the default brand when HighLevel fails, and does not cache the failure", async () => {
    const fetchValues = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(values);
    const { service } = setup(fetchValues);
    expect((await service.getBrand("t1")).cssVars).toEqual({});
    expect((await service.getBrand("t1")).cssVars["--main-color"]).toBe("#123456");
  });

  it("shares one in-flight fetch between simultaneous callers", async () => {
    const fetchValues = vi.fn().mockResolvedValue(values);
    const { service } = setup(fetchValues);
    await Promise.all([service.getBrand("t1"), service.getBrand("t1"), service.getBrand("t1")]);
    expect(fetchValues).toHaveBeenCalledTimes(1);
  });
});
