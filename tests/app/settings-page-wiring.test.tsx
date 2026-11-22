import { beforeEach, describe, expect, it, vi } from "vitest";

// The settings route signs the tenant in from the request headers, reads that tenant's custom values
// and hands them to the page. Everything behind the feature indexes is replaced.
const { currentUserFromHeaders, listTenantCustomValues, SettingsPage } = vi.hoisted(() => ({
  currentUserFromHeaders: vi.fn(),
  listTenantCustomValues: vi.fn(),
  SettingsPage: vi.fn(() => null),
}));

vi.mock("@/features/auth", () => ({ currentUserFromHeaders }));
vi.mock("@/features/highlevel", () => ({ listTenantCustomValues }));
vi.mock("@/features/settings", () => ({ SettingsPage }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import Page from "../../src/app/(app)/settings/page";

const values = async () => ((await Page()) as { props: { initialValues: Record<string, string> } }).props.initialValues;

beforeEach(() => vi.clearAllMocks());

describe("settings page", () => {
  it("maps the tenant's custom values to a key-to-value record (made-up values)", async () => {
    currentUserFromHeaders.mockResolvedValue({ tenantId: "tenant_1" });
    listTenantCustomValues.mockResolvedValue([{ key: "business_name", value: "Test Co" }, { key: "business_address_city", value: "Testville" }]);
    expect(await values()).toEqual({ business_name: "Test Co", business_address_city: "Testville" });
    expect(listTenantCustomValues).toHaveBeenCalledWith("tenant_1");
  });
  it("passes an empty record, not sample data, when the values cannot be read", async () => {
    currentUserFromHeaders.mockResolvedValue({ tenantId: "tenant_1" });
    listTenantCustomValues.mockRejectedValue(new Error("down"));
    expect(await values()).toEqual({});
  });
  it("passes an empty record and reads nothing without a tenant", async () => {
    currentUserFromHeaders.mockResolvedValue({ tenantId: null });
    expect(await values()).toEqual({});
    expect(listTenantCustomValues).not.toHaveBeenCalled();
  });
});
