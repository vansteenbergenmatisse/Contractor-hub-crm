import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({ tenant: { findMany: vi.fn() }, user: { findMany: vi.fn() } }));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("@/features/brand", () => ({ ensureSignInSlugs: async () => new Map(), signInPath: (slug: string) => `/s/${slug}` }));

import { listClients, loginState, toClientRow } from "@/features/admin";

const tenant = { id: "t1", name: "Acme", locationId: "l1", status: "connected" as const };
const blocked = { tenantId: "t1", disabledAt: new Date("2026-11-01") };

beforeEach(() => vi.clearAllMocks());

describe("the lock is the single source for the login row", () => {
  it("reads on when the lock is known to be absent, even if every user is blocked", () => {
    expect(loginState(2, 0, false)).toBe("on");
    expect(toClientRow({ ...tenant, loginDisabledAt: null }, 2, 0).login).toBe("on");
  });

  it("reads off with a lock, with or without users", () => {
    const off = new Date("2026-11-02");
    expect(toClientRow({ ...tenant, loginDisabledAt: off }, 0, 0).login).toBe("off");
    expect(toClientRow({ ...tenant, loginDisabledAt: off }, 2, 2).login).toBe("off");
  });

  it("still reads no users when no lock exists and the client has nobody", () => {
    expect(toClientRow({ ...tenant, loginDisabledAt: null }, 0, 0).login).toBe("no users");
  });

  it("after turn-on, a reload shows on for a client whose users were all removed", async () => {
    prisma.tenant.findMany.mockResolvedValue([{ ...tenant, loginLock: null }]);
    prisma.user.findMany.mockResolvedValue([blocked, blocked]);
    expect((await listClients())[0].login).toBe("on");
  });

  it("after turn-off, a reload shows off for a client with no users", async () => {
    prisma.tenant.findMany.mockResolvedValue([{ ...tenant, loginLock: { disabledAt: new Date("2026-11-02") } }]);
    prisma.user.findMany.mockResolvedValue([]);
    expect((await listClients())[0].login).toBe("off");
  });
});
