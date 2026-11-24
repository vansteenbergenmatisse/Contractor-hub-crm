import { beforeEach, describe, expect, it, vi } from "vitest";

// The settings route passes the status of its read, so the page says "did not load" only on a real
// failure. Everything behind the feature indexes is replaced. Made-up values only.
const { currentUserFromHeaders, listTenantCustomValues, SettingsPage } = vi.hoisted(() => ({
  currentUserFromHeaders: vi.fn(),
  listTenantCustomValues: vi.fn(),
  SettingsPage: vi.fn(() => null),
}));

vi.mock("@/features/auth", () => ({ currentUserFromHeaders }));
vi.mock("@/features/brand", () => ({ getTenantCustomValues: listTenantCustomValues }));
vi.mock("@/features/settings", async () => {
  const { settingsValuesFrom } = await import("../../src/features/settings/api/allowlist");
  const { sectionFromParam } = await import("../../src/features/settings/api/section-param");
  const { loadSettingsValues } = await import("../../src/features/settings/api/load-values");
  return { SettingsPage, settingsValuesFrom, sectionFromParam, loadSettingsValues };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import Page from "../../src/app/(app)/settings/page";

const status = async () => ((await Page({})) as { props: { loadStatus?: string } }).props.loadStatus;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("settings page: the status of the read", () => {
  it("is ok for a blank account", async () => {
    currentUserFromHeaders.mockResolvedValue({ tenantId: "tenant_1" });
    listTenantCustomValues.mockResolvedValue([{ key: "business_name", value: "" }]);
    expect(await status()).toBe("ok");
  });

  it("is failed when the read fails", async () => {
    currentUserFromHeaders.mockResolvedValue({ tenantId: "tenant_1" });
    listTenantCustomValues.mockRejectedValue(new Error("down"));
    expect(await status()).toBe("failed");
  });

  it("is not-connected when the reader says the tenant has no connection", async () => {
    currentUserFromHeaders.mockResolvedValue({ tenantId: "tenant_1" });
    listTenantCustomValues.mockRejectedValue(Object.assign(new Error("x"), { code: "not-connected" }));
    expect(await status()).toBe("not-connected");
  });
});
