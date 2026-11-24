import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Settings route tells the page why a save cannot reach HighLevel, so Save never pretends.
// Everything behind the feature indexes is replaced except the write-back flags. Made-up ids.
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
import { SAVE_OFF_FOR_OFFICE, SAVE_OFF_FOR_OWNER } from "@/features/settings-write-back";

type Rendered = { type: unknown; props: { saveDisabledReason?: string; readOnly?: boolean } };
const render = async () => (await Page({})) as Rendered;

beforeEach(() => {
  vi.clearAllMocks();
  listTenantCustomValues.mockResolvedValue([{ key: "business_name", value: "Test Co" }]);
});
afterEach(() => vi.unstubAllEnvs());

describe("settings page when saving is off", () => {
  it("tells an owner of a business without write-back to ask Forge Forward", async () => {
    vi.stubEnv("SETTINGS_WRITE_BACK_ENABLED", "");
    currentUserFromHeaders.mockResolvedValue({ id: "U1", role: "owner", tenantId: "T1" });
    const out = await render();
    expect(out.type).toBe(SettingsPage);
    expect(out.props.saveDisabledReason).toBe(SAVE_OFF_FOR_OWNER);
  });

  it("tells an office user only the owner can change the details", async () => {
    vi.stubEnv("SETTINGS_WRITE_BACK_ENABLED", "true");
    vi.stubEnv("SETTINGS_WRITE_BACK_ALL", "true");
    currentUserFromHeaders.mockResolvedValue({ id: "U2", role: "office", tenantId: "T1" });
    expect((await render()).props.saveDisabledReason).toBe(SAVE_OFF_FOR_OFFICE);
  });

  it("gives an excluded owner the reason, even with write-back on for all", async () => {
    vi.stubEnv("SETTINGS_WRITE_BACK_ENABLED", "true");
    vi.stubEnv("SETTINGS_WRITE_BACK_ALL", "true");
    vi.stubEnv("SETTINGS_WRITE_BACK_EXCLUDE", "T1");
    currentUserFromHeaders.mockResolvedValue({ id: "U1", role: "owner", tenantId: "T1" });
    expect((await render()).props.saveDisabledReason).toBe(SAVE_OFF_FOR_OWNER);
  });

  it("gives an owner the saving page when write-back is on for all", async () => {
    vi.stubEnv("SETTINGS_WRITE_BACK_ENABLED", "true");
    vi.stubEnv("SETTINGS_WRITE_BACK_ALL", "true");
    currentUserFromHeaders.mockResolvedValue({ id: "U1", role: "owner", tenantId: "T2" });
    const out = await render();
    expect(out.type).not.toBe(SettingsPage);
    expect(out.props.saveDisabledReason).toBeUndefined();
  });
});
