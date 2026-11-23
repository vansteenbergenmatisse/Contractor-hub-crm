import { beforeEach, describe, expect, it, vi } from "vitest";

const { aggregate } = vi.hoisted(() => ({ aggregate: vi.fn() }));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({ customValueChange: { aggregate } }) }));

import { readBrandVersion } from "../../../src/features/brand/db/brand-version";

beforeEach(() => {
  aggregate.mockReset();
});

describe("readBrandVersion", () => {
  it("is the newest finished change of that tenant that may have reached HighLevel", async () => {
    aggregate.mockResolvedValue({ _max: { finishedAt: new Date("2026-11-23T10:00:00.000Z") } });
    expect(await readBrandVersion("t1")).toBe("2026-11-23T10:00:00.000Z");
    expect(aggregate).toHaveBeenCalledWith({
      where: { tenantId: "t1", outcome: { in: ["saved", "unknown", "reverted"] } },
      _max: { finishedAt: true },
    });
  });

  it("is null when the tenant has no such change", async () => {
    aggregate.mockResolvedValue({ _max: { finishedAt: null } });
    expect(await readBrandVersion("t1")).toBeNull();
  });

  it("rejects instead of holding up the page when the database is slow", async () => {
    vi.useFakeTimers();
    try {
      aggregate.mockReturnValue(new Promise(() => {}));
      const read = readBrandVersion("t1");
      const check = expect(read).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(1_500);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });
});
