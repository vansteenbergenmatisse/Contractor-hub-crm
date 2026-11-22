import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// An UNINSTALL that lands after HighLevel's list was read must win over the older list.
let existing: { companyId: string | null; uninstalledAt: Date | null } | null;
const fake = {
  tenant: {
    findUnique: vi.fn(async () => existing),
    upsert: vi.fn(async () => ({ id: "tenant_1" })),
  },
  hlLocationConnection: { upsert: vi.fn(async () => ({})) },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fake)),
};
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => fake }));

import { saveLocationConnection } from "@/features/highlevel";

const key = randomBytes(32).toString("base64");
const listedAt = new Date("2026-11-22T10:00:00.000Z");
const input = {
  locationId: "loc_1",
  companyId: "company_1",
  name: null,
  accessToken: "loc-access",
  refreshToken: "loc-refresh",
  expiresAt: new Date("2026-11-23T10:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  existing = null;
});

describe("saveLocationConnection with listedAt", () => {
  it("refuses a tenant uninstalled after the list was read, and writes nothing", async () => {
    existing = { companyId: "company_1", uninstalledAt: new Date(listedAt.getTime() + 1000) };
    await expect(saveLocationConnection({ ...input, listedAt }, key)).rejects.toThrow("uninstalled after");
    expect(fake.tenant.upsert).not.toHaveBeenCalled();
    expect(fake.hlLocationConnection.upsert).not.toHaveBeenCalled();
  });

  it("reconnects a tenant uninstalled before the list was read (a genuine reinstall)", async () => {
    existing = { companyId: "company_1", uninstalledAt: new Date(listedAt.getTime() - 1000) };
    await expect(saveLocationConnection({ ...input, listedAt }, key)).resolves.toEqual({ tenantId: "tenant_1" });
  });

  it("without listedAt the normal reinstall path is unchanged", async () => {
    existing = { companyId: "company_1", uninstalledAt: new Date(listedAt.getTime() + 1000) };
    await expect(saveLocationConnection(input, key)).resolves.toEqual({ tenantId: "tenant_1" });
  });
});
