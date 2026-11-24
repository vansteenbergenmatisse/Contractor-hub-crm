import { beforeEach, describe, expect, it, vi } from "vitest";

// Wave E: /admin/clients/[tenantId]/values and its route are thin; the feature does the work.
const { adminValuesRoute, loadAdminValues, getRequestUser } = vi.hoisted(() => ({
  adminValuesRoute: vi.fn(async () => new Response("ok")),
  loadAdminValues: vi.fn(),
  getRequestUser: vi.fn(),
}));

vi.mock("@/features/admin-values", () => ({ adminValuesRoute, loadAdminValues, AdminValuesPage: "AdminValuesPage" }));
vi.mock("../../src/app/session", () => ({ getRequestUser }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/features/admin", () => ({ ClientsTable: "ClientsTable", ClientViewBanner: "ClientViewBanner", listClients: async () => [{ tenantId: "T1" }] }));
vi.mock("@/features/onboarding", () => ({ scheduleTokenRenewal: vi.fn() }));
vi.mock("@/features/template-copy", () => ({ loadTemplateCopyView: async () => undefined }));

describe("/admin/clients offers Edit values", () => {
  it("to an admin, not during View as client", async () => {
    const { default: Page } = await import("../../src/app/admin/clients/page");
    getRequestUser.mockResolvedValue({ id: "a1", role: "admin", tenantId: null });
    expect(((await Page()) as { props: { editValues?: boolean } }).props.editValues).toBe(true);
    getRequestUser.mockResolvedValue({ id: "a1", role: "admin", tenantId: "T1", viewing: true });
    const viewing = (await Page()) as { props: { children: { props: { editValues?: boolean } }[] } };
    expect(viewing.props.children[1].props.editValues).toBeUndefined();
  });
});

beforeEach(() => vi.clearAllMocks());

const params = (tenantId: string) => ({ params: Promise.resolve({ tenantId }) });

describe("POST /api/admin/clients/[tenantId]/values", () => {
  it("passes the request and the tenant id from the URL to the feature", async () => {
    const { POST } = await import("../../src/app/api/admin/clients/[tenantId]/values/route");
    const request = new Request("https://crm.example.test/x", { method: "POST" });
    await POST(request, params("T9"));
    expect(adminValuesRoute).toHaveBeenCalledWith(request, "T9");
  });

  it("answers 500 with a fixed body when the environment is not set", async () => {
    adminValuesRoute.mockRejectedValueOnce(new Error("secret"));
    const { POST } = await import("../../src/app/api/admin/clients/[tenantId]/values/route");
    const response = await POST(new Request("https://crm.example.test/x", { method: "POST" }), params("T"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret");
  });
});

describe("/admin/clients/[tenantId]/values page", () => {
  it("renders the values of the tenant in the URL for an admin", async () => {
    getRequestUser.mockResolvedValue({ id: "a1", role: "admin", tenantId: null });
    loadAdminValues.mockResolvedValue({ tenantId: "T1", clientName: "Acme", writable: true, folders: [] });
    const { default: Page } = await import("../../src/app/admin/clients/[tenantId]/values/page");
    const element = (await Page(params("T1"))) as { props: { view: unknown } };
    expect(loadAdminValues).toHaveBeenCalledWith("T1");
    expect(element.props.view).toEqual({ tenantId: "T1", clientName: "Acme", writable: true, folders: [] });
  });

  it.each([
    ["signed out", null],
    ["an owner", { id: "u1", role: "owner", tenantId: "T1" }],
    ["an admin in View as client", { id: "a1", role: "admin", tenantId: "T1", viewing: true }],
  ])("is a 404 for %s and reads nothing", async (_name, user) => {
    getRequestUser.mockResolvedValue(user);
    const { default: Page } = await import("../../src/app/admin/clients/[tenantId]/values/page");
    await expect(Page(params("T1"))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadAdminValues).not.toHaveBeenCalled();
  });

  it("is a 404 for a tenant that is not connected", async () => {
    getRequestUser.mockResolvedValue({ id: "a1", role: "admin", tenantId: null });
    loadAdminValues.mockResolvedValue(null);
    const { default: Page } = await import("../../src/app/admin/clients/[tenantId]/values/page");
    await expect(Page(params("T1"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
