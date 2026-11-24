import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A user with no connected business must not read "ask Forge Forward to turn it on". Made-up ids.
const { currentUserFromHeaders, listTenantCustomValues, SettingsPage } = vi.hoisted(() => ({
  currentUserFromHeaders: vi.fn(),
  listTenantCustomValues: vi.fn(),
  SettingsPage: vi.fn(() => null),
}));

vi.mock("@/features/auth", () => ({ currentUserFromHeaders, hitRateLimit: vi.fn() }));
vi.mock("@/features/brand", () => ({ getTenantCustomValues: listTenantCustomValues, getTenantCustomValuesReadOnly: listTenantCustomValues }));
vi.mock("@/features/highlevel", () => ({ createTenantPhoneNumbersReader: () => async () => ({ ok: false, reason: "unavailable" }) }));
vi.mock("@/features/settings", async () => {
  const { sectionFromParam } = await import("../../src/features/settings/api/section-param");
  const { loadSettingsValues } = await import("../../src/features/settings/api/load-values");
  return { SettingsPage, sectionFromParam, loadSettingsValues };
});
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import Page from "../../src/app/(app)/settings/page";
import { SAVE_OFF_NOT_CONNECTED } from "@/features/settings-write-back";

type Rendered = { type: unknown; props: { saveDisabledReason?: string } };
const render = async () => (await Page({})) as Rendered;

beforeEach(() => {
  vi.clearAllMocks();
  listTenantCustomValues.mockResolvedValue([]);
  vi.stubEnv("SETTINGS_WRITE_BACK_ENABLED", "true");
  vi.stubEnv("SETTINGS_WRITE_BACK_ALL", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("settings page for a user with no connected business", () => {
  it("says the business is not connected for an owner with no tenant", async () => {
    currentUserFromHeaders.mockResolvedValue({ id: "U1", role: "owner", tenantId: null });
    expect((await render()).props.saveDisabledReason).toBe(SAVE_OFF_NOT_CONNECTED);
  });

  it("says the business is not connected when there is no user", async () => {
    currentUserFromHeaders.mockResolvedValue(null);
    expect((await render()).props.saveDisabledReason).toBe(SAVE_OFF_NOT_CONNECTED);
  });
});
