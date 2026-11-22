import { describe, expect, it, vi } from "vitest";
import { COLOR_KEYS, ESSENTIAL_KEYS, isKeyAllowedBy, isSettingsKeyAllowed, loadSettingsValues, settingsValuesFrom } from "@/features/settings";

// Made-up keys and values only. The server builds the Settings value map from an allowlist, so a
// secret custom value (the form webhook, an API key) never reaches the browser.
const row = (key: string, value: string | null = "v") => ({ key, value });

describe("settingsValuesFrom (server allowlist)", () => {
  it("keeps the design's business keys and the 14 color keys", () => {
    const out = settingsValuesFrom([...ESSENTIAL_KEYS, ...COLOR_KEYS].map((k) => row(k, `val-${k}`)));
    for (const k of [...ESSENTIAL_KEYS, ...COLOR_KEYS]) expect(out[k]).toBe(`val-${k}`);
  });

  it("keeps the documented profile, booking and Google keys", () => {
    const keys = [
      "business_address_city", "business_address_state", "business_hours", "business_hours_weekdays_open",
      "business_hours_weekdays_close", "business_hours_saturday_open", "business_hours_sunday_close",
      "business_latitude", "business_longitude", "request_a_job_booking_link", "request_a_quote_booking_link",
      "business_google_profile_url", "google_review_request_url", "bbb_review_request_url", "business_favicon_url",
      "business_logo", "universal_cta", "business_website_url", "business_main_city", "business_main_county",
      "referral_reward_text", "seasonal_offer_text",
    ];
    const out = settingsValuesFrom(keys.map((k) => row(k, "x")));
    expect(Object.keys(out).sort()).toEqual([...keys].sort());
  });

  it("drops the form webhook, secrets, the maps embed and unknown keys", () => {
    const bad = [
      "0_webhook_url_form", "0_anything", "some_api_key", "stripe_secret", "SOME_APIKEY", "zapier_webhook",
      "hl_token", "admin_password", "google_maps_embed_src", "_google_maps_embed_src", "unknown_tenant_key",
      "business_main_api_key", "business_hours_secret",
    ];
    const out = settingsValuesFrom([...bad.map((k) => row(k, "https://hooks.example/secret")), row("business_name", "Test Co")]);
    expect(out).toEqual({ business_name: "Test Co" });
    for (const k of bad) expect(isSettingsKeyAllowed(k)).toBe(false);
  });

  it("keeps only the exact known business_main_* and business_hours* keys, no open-ended prefix", () => {
    for (const k of [
      "business_hours", "business_hours_weekdays_open", "business_hours_weekdays_close", "business_hours_saturday_open",
      "business_hours_saturday_close", "business_hours_sunday_open", "business_hours_sunday_close", "business_main_city",
      "business_main_county", "business_main_state_abbreviation", "business_main_keyword",
      "business_main_background_video_or_image", "business_full_address",
    ]) {
      expect(isSettingsKeyAllowed(k), k).toBe(true);
    }
    const hostile = [
      "business_main_stripe_key", "business_main_private_key", "business_main_credentials", "business_main_client_id",
      "business_main_bearer", "business_main_x", "business_main_", "business_hoursx", "business_hours_stripe_key",
      "business_hours_private", "business_hours_weekdays_open_key", "business_main_city_password", "business_name_secret",
      "main_color_token", "business_main_cityx",
    ];
    for (const k of hostile) expect(isSettingsKeyAllowed(k), k).toBe(false);
    expect(settingsValuesFrom(hostile.map((k) => row(k, "sk_test_made_up")))).toEqual({});
  });

  it("refuses business_main_map_embed and business_bank_account_number", () => {
    expect(isSettingsKeyAllowed("business_main_map_embed")).toBe(false);
    expect(isSettingsKeyAllowed("business_bank_account_number")).toBe(false);
  });

  it("the deny rule refuses a secret-looking key even when the list would let it through", () => {
    const hostile = [
      "business_main_map_embed", "business_hours_token", "business_bank_account_number", "business_main_stripe_key",
      "business_main_private_key", "business_main_credentials", "0_business_name", "_business_name",
    ];
    const list = new Set([...hostile, "business_name", "business_main_keyword"]);
    for (const k of hostile) expect(isKeyAllowedBy(k, list), k).toBe(false);
    expect(isKeyAllowedBy("business_main_keyword", list)).toBe(true);
    expect(isKeyAllowedBy("business_name", list)).toBe(true);
  });

  it("refuses a key of 101 characters and keeps the first row of a key that appears twice", () => {
    const long = "a".repeat(101);
    expect(isKeyAllowedBy(long, new Set([long]))).toBe(false);
    expect(isKeyAllowedBy("a".repeat(100), new Set(["a".repeat(100)]))).toBe(true);
    expect(settingsValuesFrom([row("business_name", "First Co"), row("business_name", "Second Co")])).toEqual({ business_name: "First Co" });
  });

  it("drops keys with odd characters", () => {
    for (const k of ["business_name ", "business-name", "business_main_<x>", "business_main_city\"", "__proto__", "business_main_ü", ""]) {
      expect(isSettingsKeyAllowed(k), k).toBe(false);
      expect(Object.keys(settingsValuesFrom([row(k)]))).toEqual([]);
    }
  });

  it("drops a value longer than 2000 characters and keeps one of exactly 2000", () => {
    const out = settingsValuesFrom([row("business_hours", "a".repeat(2001)), row("business_address", "b".repeat(2000))]);
    expect(out.business_hours).toBeUndefined();
    expect(out.business_address).toHaveLength(2000);
  });

  it("turns a missing value into an empty string", () => {
    expect(settingsValuesFrom([row("business_email", null)])).toEqual({ business_email: "" });
  });
});

describe("loadSettingsValues", () => {
  it("reads the tenant's values through the allowlist", async () => {
    const read = vi.fn(async () => [row("business_name", "Test Co"), row("0_webhook_url_form", "https://hooks.example/x")]);
    expect(await loadSettingsValues("tenant-a", read)).toEqual({ business_name: "Test Co" });
    expect(read).toHaveBeenCalledWith("tenant-a");
  });

  it("gives empty values with no tenant (without reading) or when the read fails", async () => {
    const read = vi.fn(async () => [row("business_name", "Test Co")]);
    expect(await loadSettingsValues(null, read)).toEqual({});
    expect(read).not.toHaveBeenCalled();
    expect(await loadSettingsValues("tenant-a", async () => { throw new Error("down"); })).toEqual({});
  });
});
