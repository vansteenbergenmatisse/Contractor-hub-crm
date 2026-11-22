import { describe, expect, it } from "vitest";
import { COLOR_KEYS, ESSENTIAL_KEYS, isSettingsKeyAllowed, settingsValuesFrom } from "@/features/settings";

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
