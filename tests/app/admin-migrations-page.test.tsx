import { beforeEach, describe, expect, it, vi } from "vitest";

const { getRequestUser, loadMigrationsView } = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  loadMigrationsView: vi.fn(async () => ({ environment: "local" })),
}));

vi.mock("../../src/app/session", () => ({ getRequestUser }));
vi.mock("@/features/admin", () => ({ MigrationsPanel: "MigrationsPanel", loadMigrationsView }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

import Page from "../../src/app/admin/migrations/page";

beforeEach(() => vi.clearAllMocks());

describe("/admin/migrations guard", () => {
  it("shows the check to an admin who is not viewing a client", async () => {
    getRequestUser.mockResolvedValue({ id: "a1", role: "admin", tenantId: null });
    const page = (await Page()) as { props: { view: unknown } };
    expect(page.props.view).toEqual({ environment: "local" });
  });

  it.each([
    ["signed out", null],
    ["an owner", { id: "u1", role: "owner", tenantId: "T1" }],
    ["office", { id: "u2", role: "office", tenantId: "T1" }],
    ["an admin viewing as a client", { id: "a1", role: "admin", tenantId: "T1", viewing: true }],
  ])("answers 404 to %s and reads nothing", async (_name, user) => {
    getRequestUser.mockResolvedValue(user);
    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(loadMigrationsView).not.toHaveBeenCalled();
  });
});
