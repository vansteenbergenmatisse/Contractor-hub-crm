import { beforeEach, describe, expect, it, vi } from "vitest";

// Bug sweep 2026-11-23, A1: "Turn on login" skips people removed from HighLevel.
const prisma = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
  ghlUserLink: { findMany: vi.fn() },
}));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => prisma }));

import { createGuards, handleSetTenantLogin, listTenantUserIds, type SessionUser } from "@/features/auth";

const ORIGIN = "https://crm.example.test";
const admin: SessionUser = { id: "a1", email: "a@x.test", name: "A", role: "admin", tenantId: null };
const post = (disabled: boolean) => new Request(`${ORIGIN}/x`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ disabled }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  prisma.tenant.findUnique.mockResolvedValue({ id: "T1" });
  prisma.user.findMany.mockResolvedValue([{ id: "u1" }, { id: "gone" }]);
  prisma.ghlUserLink.findMany.mockResolvedValue([{ userId: "gone" }]);
});

async function run(disabled: boolean) {
  const setUserDisabled = vi.fn(async () => {});
  const response = await handleSetTenantLogin(post(disabled), "T1", {
    guards: createGuards({ getSession: async () => admin }),
    listUserIds: listTenantUserIds,
    setUserDisabled,
    limiter: async () => true,
    appOrigin: ORIGIN,
  });
  return { response, setUserDisabled };
}

describe("tenant login switch and removed users", () => {
  it("turning on skips a user whose HighLevel link is marked deleted", async () => {
    const { response, setUserDisabled } = await run(false);
    expect(await response.json()).toEqual({ affected: 1 });
    expect(setUserDisabled.mock.calls).toEqual([["u1", false]]);
  });

  it("turning off still covers every user", async () => {
    const { setUserDisabled } = await run(true);
    expect(setUserDisabled.mock.calls).toEqual([["u1", true], ["gone", true]]);
  });
});
