import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Wave E: the Settings route loads the tenant's locked keys on the server and hands them to the page
// with the account layout. Made-up ids and values.
const { currentUserFromHeaders, listTenantCustomValues, SettingsPage, loadLockedKeys } = vi.hoisted(() => ({
  currentUserFromHeaders: vi.fn(),
  listTenantCustomValues: vi.fn(),
  SettingsPage: vi.fn(() => null),
  loadLockedKeys: vi.fn(),
}));

vi.mock("@/features/auth", () => ({ currentUserFromHeaders, hitRateLimit: vi.fn() }));
vi.mock("@/features/brand", () => ({ getTenantCustomValues: listTenantCustomValues, getTenantCustomValuesReadOnly: listTenantCustomValues }));
vi.mock("@/features/highlevel", () => ({ createTenantPhoneNumbersReader: () => async () => ({ ok: false, reason: "unavailable" }) }));
vi.mock("@/features/settings", async () => {
  const { sectionFromParam } = await import("../../src/features/settings/api/section-param");
  const { loadSettingsValues } = await import("../../src/features/settings/api/load-values");
  return { SettingsPage, sectionFromParam, loadSettingsValues };
});
vi.mock("@/features/settings-write-back", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/settings-write-back")>()),
  loadLockedKeys,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import Page from "../../src/app/(app)/settings/page";

type Rendered = { props: { account?: { lockedKeys?: string[] } } };
const render = async () => (await Page({})) as Rendered;

beforeEach(() => {
  vi.clearAllMocks();
  listTenantCustomValues.mockResolvedValue([{ key: "business_name", value: "Test Co" }]);
});
afterEach(() => vi.unstubAllEnvs());

describe("settings page and locks", () => {
  it("hands the tenant's locked keys to the page", async () => {
    currentUserFromHeaders.mockResolvedValue({ id: "U1", role: "owner", tenantId: "T1" });
    loadLockedKeys.mockResolvedValue(["business_name"]);
    const out = await render();
    expect(loadLockedKeys).toHaveBeenCalledWith("T1");
    expect(out.props.account?.lockedKeys).toEqual(["business_name"]);
  });

  it("leaves the layout without a lock list when nothing is locked", async () => {
    currentUserFromHeaders.mockResolvedValue({ id: "U1", role: "owner", tenantId: "T1" });
    loadLockedKeys.mockResolvedValue([]);
    expect((await render()).props.account).not.toHaveProperty("lockedKeys");
  });
});
