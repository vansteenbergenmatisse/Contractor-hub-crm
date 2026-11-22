import { beforeEach, describe, expect, it, vi } from "vitest";

const { link, tenant } = vi.hoisted(() => ({
  link: { findMany: vi.fn(), findUnique: vi.fn(), createMany: vi.fn() },
  tenant: { findUnique: vi.fn() },
}));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({ tenantSignInLink: link, tenant }) }));

import { ensureSignInSlugs, findConnectedTenantBySlug } from "../../../src/features/brand/db/sign-in-link";

beforeEach(() => vi.resetAllMocks());

describe("ensureSignInSlugs", () => {
  it("keeps an existing slug when the business name changed", async () => {
    link.findMany.mockResolvedValue([{ tenantId: "t1", slug: "old-name" }]);
    const slugs = await ensureSignInSlugs([{ id: "t1", name: "New Name" }]);
    expect(slugs.get("t1")).toBe("old-name");
    expect(link.createMany).not.toHaveBeenCalled();
  });

  it("creates missing slugs, resolving collisions, without overwriting a row", async () => {
    link.findMany
      .mockResolvedValueOnce([{ tenantId: "t1", slug: "acme" }])
      .mockResolvedValueOnce([{ tenantId: "t1", slug: "acme" }, { tenantId: "t2", slug: "acme-2" }, { tenantId: "t3", slug: "acme-3" }]);
    link.createMany.mockResolvedValue({ count: 2 });
    const slugs = await ensureSignInSlugs([
      { id: "t1", name: "Acme" },
      { id: "t2", name: "Acme" },
      { id: "t3", name: "ACME" },
    ]);
    expect(link.createMany).toHaveBeenCalledWith({
      data: [{ tenantId: "t2", slug: "acme-2" }, { tenantId: "t3", slug: "acme-3" }],
      skipDuplicates: true,
    });
    expect(slugs.get("t3")).toBe("acme-3");
  });

  it("gives an empty result while the table is missing, so admin keeps working", async () => {
    link.findMany.mockRejectedValue(Object.assign(new Error("missing"), { code: "P2021" }));
    await expect(ensureSignInSlugs([{ id: "t1", name: "Acme" }])).resolves.toEqual(new Map());
  });
});

describe("findConnectedTenantBySlug", () => {
  it("returns the tenant of a connected client", async () => {
    link.findUnique.mockResolvedValue({ tenantId: "t1" });
    tenant.findUnique.mockResolvedValue({ status: "connected" });
    await expect(findConnectedTenantBySlug("acme")).resolves.toBe("t1");
  });

  it.each(["uninstalled", "needs_reconnect"])("returns null for a %s client", async (status) => {
    link.findUnique.mockResolvedValue({ tenantId: "t1" });
    tenant.findUnique.mockResolvedValue({ status });
    await expect(findConnectedTenantBySlug("acme")).resolves.toBeNull();
  });

  it("returns null for an unknown slug or a removed tenant", async () => {
    link.findUnique.mockResolvedValueOnce(null);
    await expect(findConnectedTenantBySlug("nobody")).resolves.toBeNull();
    link.findUnique.mockResolvedValueOnce({ tenantId: "gone" });
    tenant.findUnique.mockResolvedValueOnce(null);
    await expect(findConnectedTenantBySlug("acme")).resolves.toBeNull();
  });
});
