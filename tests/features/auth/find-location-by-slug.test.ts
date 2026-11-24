import { beforeEach, describe, expect, it, vi } from "vitest";

// The hint's link is only built for a client that is connected and whose login is on: the db lookup
// answers null for anything else, so /sign-in then shows the generic page.
const { linkFind, tenantFind } = vi.hoisted(() => ({ linkFind: vi.fn(), tenantFind: vi.fn() }));
vi.mock("@/shared/lib/prisma", () => ({
  getPrisma: () => ({ tenantSignInLink: { findUnique: linkFind }, tenant: { findUnique: tenantFind } }),
}));

import { findLocationIdBySlug } from "../../../src/features/auth/db/highlevel-sign-in";

beforeEach(() => {
  vi.clearAllMocks();
  linkFind.mockResolvedValue({ tenantId: "t1" });
});

describe("findLocationIdBySlug", () => {
  it("a connected client with login on: its location", async () => {
    tenantFind.mockResolvedValue({ status: "connected", locationId: "loc_1", loginLock: null });
    expect(await findLocationIdBySlug("sample-roofing")).toBe("loc_1");
  });

  it.each(["uninstalled", "needs_reconnect"])("a %s client: null", async (status) => {
    tenantFind.mockResolvedValue({ status, locationId: "loc_1", loginLock: null });
    expect(await findLocationIdBySlug("sample-roofing")).toBeNull();
  });

  it("a client whose login is off: null", async () => {
    tenantFind.mockResolvedValue({ status: "connected", locationId: "loc_1", loginLock: { disabledAt: new Date() } });
    expect(await findLocationIdBySlug("sample-roofing")).toBeNull();
  });

  it("an unknown slug, a missing tenant or a database error: null", async () => {
    linkFind.mockResolvedValueOnce(null);
    expect(await findLocationIdBySlug("gone")).toBeNull();
    tenantFind.mockResolvedValueOnce(null);
    expect(await findLocationIdBySlug("sample-roofing")).toBeNull();
    linkFind.mockRejectedValueOnce(new Error("down"));
    expect(await findLocationIdBySlug("sample-roofing")).toBeNull();
  });
});
