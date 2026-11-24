import { describe, expect, it, vi } from "vitest";

const { currentUserFromHeaders, listTenantCustomValues, SettingsPage } = vi.hoisted(() => ({
  currentUserFromHeaders: vi.fn(),
  listTenantCustomValues: vi.fn(),
  SettingsPage: vi.fn(() => null),
}));

vi.mock("@/features/auth", () => ({ currentUserFromHeaders, hitRateLimit: vi.fn() }));
vi.mock("@/features/brand", () => ({ getTenantCustomValues: listTenantCustomValues }));
vi.mock("@/features/highlevel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/highlevel")>()),
  createTenantPhoneNumbersReader: () => () => new Promise(() => {}),
}));
vi.mock("@/features/settings", async () => {
  const { settingsValuesFrom } = await import("../../src/features/settings/api/allowlist");
  const { sectionFromParam } = await import("../../src/features/settings/api/section-param");
  const { loadSettingsValues } = await import("../../src/features/settings/api/load-values");
  return { SettingsPage, settingsValuesFrom, sectionFromParam, loadSettingsValues };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import Page from "../../src/app/(app)/settings/page";

describe("settings page with a phone read that never finishes", () => {
  it("still renders the details and hands the row a pending read", async () => {
    currentUserFromHeaders.mockResolvedValue({ tenantId: "tenant_1" });
    listTenantCustomValues.mockResolvedValue([{ key: "business_name", value: "Test Co" }]);
    const page = (await Promise.race([
      Page({}),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 1000)),
    ])) as "blocked" | { props: { initialValues: Record<string, string>; phoneNumbers: unknown } };
    expect(page).not.toBe("blocked");
    if (page === "blocked") return;
    expect(page.props.initialValues).toEqual({ business_name: "Test Co" });
    expect(page.props.phoneNumbers).toBeInstanceOf(Promise);
  });
});
