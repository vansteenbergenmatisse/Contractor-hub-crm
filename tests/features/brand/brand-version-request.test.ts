import { beforeEach, describe, expect, it, vi } from "vitest";

// React's `cache` only memoizes inside a server render, so a simple per-argument memo stands in for
// one request here.
const { aggregate, listTenantCustomValues } = vi.hoisted(() => ({ aggregate: vi.fn(), listTenantCustomValues: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return {
    ...real,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const seen = new Map<string, R>();
      return (...args: A) => {
        const key = JSON.stringify(args);
        if (!seen.has(key)) seen.set(key, fn(...args));
        return seen.get(key) as R;
      };
    },
  };
});
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({ customValueChange: { aggregate } }) }));
vi.mock("@/features/highlevel", () => ({ listTenantCustomValues, readTenantCustomValuesStored: vi.fn() }));

import { getBrandService } from "@/features/brand";

beforeEach(() => {
  aggregate.mockResolvedValue({ _max: { finishedAt: null } });
  listTenantCustomValues.mockResolvedValue([{ key: "business_name", value: "Sample Co" }]);
});

describe("the brand version in one request", () => {
  it("is read once however many brand reads the request makes", async () => {
    const service = getBrandService();
    await Promise.all([service.getBrand("t1"), service.getValues("t1")]);
    await service.getBrand("t1");
    expect(aggregate).toHaveBeenCalledTimes(1);
  });
});
