import { beforeEach, describe, expect, it, vi } from "vitest";

const { templateCopyRoute, loadTemplateCopyView, getRequestUser, listClients } = vi.hoisted(() => ({
  templateCopyRoute: vi.fn(async () => new Response("ok")),
  loadTemplateCopyView: vi.fn(async () => ({ templateTenantId: "TPL", warnings: { T1: ["Business name"] } })),
  getRequestUser: vi.fn(),
  listClients: vi.fn(async () => [{ tenantId: "T1" }, { tenantId: "TPL" }]),
}));

vi.mock("@/features/template-copy", () => ({ templateCopyRoute, loadTemplateCopyView }));
vi.mock("../../src/app/session", () => ({ getRequestUser }));
vi.mock("@/features/admin", () => ({ ClientsTable: "ClientsTable", ClientViewBanner: "ClientViewBanner", listClients }));
vi.mock("@/features/onboarding", () => ({ scheduleTokenRenewal: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/admin/clients/[tenantId]/copy-template", () => {
  it("passes the request and the tenant id from the URL to the feature", async () => {
    const { POST } = await import("../../src/app/api/admin/clients/[tenantId]/copy-template/route");
    const request = new Request("https://crm.example.test/x", { method: "POST" });
    await POST(request, { params: Promise.resolve({ tenantId: "T9" }) });
    expect(templateCopyRoute).toHaveBeenCalledWith(request, "T9");
  });

  it("answers 500 with a fixed body when the environment is not set", async () => {
    templateCopyRoute.mockRejectedValueOnce(new Error("secret"));
    const { POST } = await import("../../src/app/api/admin/clients/[tenantId]/copy-template/route");
    const response = await POST(new Request("https://crm.example.test/x", { method: "POST" }), { params: Promise.resolve({ tenantId: "T" }) });
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Server is not configured.");
  });
});

describe("/admin/clients page: template copy", () => {
  it("hands the copy view to the table for an admin", async () => {
    getRequestUser.mockResolvedValue({ id: "a1", role: "admin", tenantId: null });
    const { default: Page } = await import("../../src/app/admin/clients/page");
    const element = (await Page()) as { props: { templateCopy?: unknown } };
    expect(loadTemplateCopyView).toHaveBeenCalledWith(["T1", "TPL"]);
    expect(element.props.templateCopy).toEqual({ templateTenantId: "TPL", warnings: { T1: ["Business name"] } });
  });

  it("offers no copy during a read-only client view", async () => {
    getRequestUser.mockResolvedValue({ id: "a1", role: "admin", tenantId: "T1", viewing: true });
    const { default: Page } = await import("../../src/app/admin/clients/page");
    await Page();
    expect(loadTemplateCopyView).not.toHaveBeenCalled();
  });
});
