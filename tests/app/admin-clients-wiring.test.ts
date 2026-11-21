import { beforeEach, describe, expect, it, vi } from "vitest";

// Wiring of the route file and the page: a handler test cannot notice a route that forgets the guard
// or passes the wrong origin. Everything behind @/features/auth is replaced; only src/app code runs.
const handleSetTenantLogin = vi.fn(async () => new Response("ok"));
const guards = { marker: "real-guards" };
const currentUserFromHeaders = vi.fn();
const listClients = vi.fn(async () => []);
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("@/features/auth", () => ({
  handleSetTenantLogin,
  getGuards: () => guards,
  getInviteLimiter: () => "limiter",
  getAuth: () => "auth",
  listTenantUserIds: "listTenantUserIds",
  setUserDisabled: vi.fn(),
  currentUserFromHeaders,
}));
vi.mock("@/features/admin", () => ({ ClientsTable: "ClientsTable", listClients }));
vi.mock("@/shared/config", () => ({ parseEnv: () => ({ APP_URL: "https://crm.example.test/some/path" }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ notFound }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/admin/clients/[tenantId]/login", () => {
  it("passes the tenant id from the URL, the real guards, the limiter and the app origin", async () => {
    const { POST } = await import("../../src/app/api/admin/clients/[tenantId]/login/route");
    const request = new Request("https://crm.example.test/x", { method: "POST" });
    await POST(request, { params: Promise.resolve({ tenantId: "T9" }) });
    const [passedRequest, tenantId, deps] = handleSetTenantLogin.mock.calls[0] as unknown as [Request, string, Record<string, unknown>];
    expect(passedRequest).toBe(request);
    expect(tenantId).toBe("T9");
    expect(deps.guards).toBe(guards);
    expect(deps.limiter).toBe("limiter");
    expect(deps.appOrigin).toBe("https://crm.example.test");
    expect(deps.listUserIds).toBe("listTenantUserIds");
  });

  it("answers 500 with a fixed body when the environment is not set", async () => {
    handleSetTenantLogin.mockRejectedValueOnce(new Error("secret"));
    const { POST } = await import("../../src/app/api/admin/clients/[tenantId]/login/route");
    const response = await POST(new Request("https://crm.example.test/x", { method: "POST" }), { params: Promise.resolve({ tenantId: "T" }) });
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Server is not configured.");
  });
});

describe("/admin/clients page", () => {
  it.each([
    ["signed out", null],
    ["owner", { role: "owner", tenantId: "T1" }],
    ["office", { role: "office", tenantId: "T1" }],
  ])("shows 404 and loads no client data for %s", async (_name, user) => {
    currentUserFromHeaders.mockResolvedValue(user);
    const { default: Page } = await import("../../src/app/admin/clients/page");
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(listClients).not.toHaveBeenCalled();
  });

  it("loads the clients for an admin", async () => {
    currentUserFromHeaders.mockResolvedValue({ role: "admin", tenantId: null });
    const { default: Page } = await import("../../src/app/admin/clients/page");
    await Page();
    expect(listClients).toHaveBeenCalledTimes(1);
    expect(notFound).not.toHaveBeenCalled();
  });
});
