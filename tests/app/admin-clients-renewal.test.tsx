import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestUser, listClients, scheduleTokenRenewal } = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  listClients: vi.fn(async () => []),
  scheduleTokenRenewal: vi.fn(),
}));

vi.mock("../../src/app/session", () => ({ getRequestUser }));
vi.mock("@/features/admin", () => ({ ClientsTable: "ClientsTable", ClientViewBanner: "ClientViewBanner", listClients }));
vi.mock("@/features/onboarding", () => ({ scheduleTokenRenewal }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import Page from "../../src/app/admin/clients/page";

beforeEach(() => vi.clearAllMocks());

describe("/admin/clients token renewal", () => {
  it("runs for an admin who is not viewing a client", async () => {
    getRequestUser.mockResolvedValue({ id: "a1", role: "admin", tenantId: null });
    await Page();
    expect(scheduleTokenRenewal).toHaveBeenCalledTimes(1);
  });

  it("never runs during a read-only client view", async () => {
    getRequestUser.mockResolvedValue({ id: "a1", role: "admin", tenantId: "T1", viewing: true });
    await Page();
    expect(scheduleTokenRenewal).not.toHaveBeenCalled();
  });

  it("never runs for anyone else", async () => {
    getRequestUser.mockResolvedValue({ id: "u1", role: "owner", tenantId: "T1" });
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(scheduleTokenRenewal).not.toHaveBeenCalled();
  });
});
