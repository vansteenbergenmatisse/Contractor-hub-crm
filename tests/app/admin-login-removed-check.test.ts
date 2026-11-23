import { beforeEach, describe, expect, it, vi } from "vitest";

// The route wires the follow-up check through each feature's public index.
const handleSetTenantLogin = vi.fn(async () => new Response("ok"));
const check = vi.fn(async () => true);
const createRemovedUserCheck = vi.fn<(deps: Record<string, unknown>) => typeof check>(() => check);
const syncTenantUsers = vi.fn();
const usersOfTenant = vi.fn(async () => []);
const deactivateGhlUser = vi.fn(async () => true);
const provisionDeps = { marker: "provision-deps" };
const listActiveLinks = vi.fn();

vi.mock("@/features/auth", () => ({
  handleSetTenantLogin,
  createRemovedUserCheck,
  deactivateGhlUser,
  getProvisionDeps: () => provisionDeps,
  listActiveLinks,
  getGuards: () => ({}),
  getInviteLimiter: () => "limiter",
  getAuth: () => "auth",
  listTenantUserIds: "listTenantUserIds",
  setUserDisabled: vi.fn(),
}));
vi.mock("@/features/onboarding", () => ({ syncTenantUsers }));
vi.mock("@/features/highlevel", () => ({ getOnboardingApi: () => ({ usersOfTenant }) }));
vi.mock("@/shared/config", () => ({ parseEnv: () => ({ APP_URL: "https://crm.example.test" }) }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/admin/clients/[tenantId]/login follow-up", () => {
  it("runs the removed-user check with the real sync, list, deactivate and links", async () => {
    const { POST } = await import("../../src/app/api/admin/clients/[tenantId]/login/route");
    await POST(new Request("https://crm.example.test/x", { method: "POST" }), { params: Promise.resolve({ tenantId: "T9" }) });
    const [, , deps] = handleSetTenantLogin.mock.calls[0] as unknown as [Request, string, { afterTurnOn(id: string): Promise<boolean> }];
    expect(createRemovedUserCheck).not.toHaveBeenCalled();
    expect(await deps.afterTurnOn("T9")).toBe(true);
    expect(check).toHaveBeenCalledWith("T9");
    const wired = createRemovedUserCheck.mock.calls[0][0] as { syncUsers: unknown; activeLinks: unknown; readUsers(id: string): Promise<unknown>; deactivate(t: string, g: string): Promise<boolean> };
    expect(wired.syncUsers).toBe(syncTenantUsers);
    expect(wired.activeLinks).toBe(listActiveLinks);
    await wired.readUsers("T9");
    expect(usersOfTenant).toHaveBeenCalledWith("T9");
    await wired.deactivate("T9", "g1");
    expect(deactivateGhlUser).toHaveBeenCalledWith(provisionDeps, "T9", "g1");
  });
});
