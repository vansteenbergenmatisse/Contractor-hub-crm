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
// The real allowlist and section mapping (pure functions); only the client component is replaced.
vi.mock("@/features/settings", async () => {
  const { settingsValuesFrom } = await import("../../src/features/settings/api/allowlist");
  const { sectionFromParam } = await import("../../src/features/settings/api/section-param");
  return { SettingsPage, settingsValuesFrom, sectionFromParam };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import Page from "../../src/app/(app)/settings/page";

type Props = { initialValues: Record<string, string>; initialSection?: string };
const props = async (searchParams?: Record<string, string | string[] | undefined>) =>
  ((await Page(searchParams ? { searchParams: Promise.resolve(searchParams) } : {})) as { props: Props }).props;
const values = async () => (await props()).initialValues;

beforeEach(() => vi.clearAllMocks());

describe("settings page", () => {
  it("maps the tenant's custom values to a key-to-value record (made-up values)", async () => {
    currentUserFromHeaders.mockResolvedValue({ tenantId: "tenant_1" });
    listTenantCustomValues.mockResolvedValue([{ key: "business_name", value: "Test Co" }, { key: "business_address_city", value: "Testville" }]);
    expect(await values()).toEqual({ business_name: "Test Co", business_address_city: "Testville" });
    expect(listTenantCustomValues).toHaveBeenCalledWith("tenant_1");
  });
  it("keeps the form webhook, secrets, the maps embed and unknown keys on the server (made-up values)", async () => {
    currentUserFromHeaders.mockResolvedValue({ tenantId: "tenant_1" });
    listTenantCustomValues.mockResolvedValue([
      { key: "business_name", value: "Test Co" }, { key: "0_webhook_url_form", value: "https://hooks.example/abc" },
      { key: "some_api_key", value: "k" }, { key: "stripe_secret", value: "s" }, { key: "unknown_tenant_key", value: "u" },
      { key: "_google_maps_embed_src", value: "<iframe>" }, { key: "google_maps_embed_src", value: "<iframe>" },
      { key: "business_hours", value: "x".repeat(2001) }, { key: "main_color", value: "#112233" },
    ]);
    expect(await values()).toEqual({ business_name: "Test Co", main_color: "#112233" });
  });

  it("opens on the section named in ?section=", async () => {
    currentUserFromHeaders.mockResolvedValue({ tenantId: null });
    expect((await props({ section: "connections" })).initialSection).toBe("conn");
    expect((await props({ section: "nope" })).initialSection).toBeUndefined();
    expect((await props()).initialSection).toBeUndefined();
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
