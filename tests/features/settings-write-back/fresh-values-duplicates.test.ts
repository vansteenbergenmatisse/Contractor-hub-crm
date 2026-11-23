import { describe, expect, it, vi } from "vitest";

const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/features/highlevel", () => ({ createTenantCustomValueAdapter: () => ({ read, update: vi.fn() }) }));
vi.mock("@/features/brand", () => ({ getBrandService: () => ({ expire: vi.fn() }) }));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: vi.fn() }));

import { freshValuesReader } from "../../../src/features/settings-write-back/api/save-instance";

describe("S4: the fresh read for the Settings page", () => {
  it("shows a key listed twice with its first value instead of blank (fake values)", async () => {
    read.mockResolvedValue({
      ok: true,
      values: [{ id: "1", key: "business_email", name: "Email", value: "a@b.test" }],
      duplicates: [{ key: "business_phone_number", value: "111" }],
    });
    const rows = await freshValuesReader(async () => [])("t");
    expect(rows).toEqual([{ key: "business_email", value: "a@b.test" }, { key: "business_phone_number", value: "111" }]);
  });
});
