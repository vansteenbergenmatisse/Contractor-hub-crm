import { describe, expect, it } from "vitest";
import { buildBrand, EMPTY_BRAND } from "@/features/brand";

// Key names are the real ones of a live sub-account (checked against screenshots of its custom
// values on 2026-11-22); every VALUE here is made up (loop-constraints rule 5: no real client data).
const v = (key: string, value: string) => ({ key, value });
const live = [
  v("business_name", "Sample Lawn Co"), v("business_owner_name", "Sam"), v("business_phone_number", "+1 (555)-010-0000"),
  v("business_email", "hello@sample.example"), v("business_address", "1 Example Rd Town ST 00000"),
  v("business_address_city", "Town"), v("business_address_state", "ST"), v("business_hours", "Open 24/7"),
  v("universal_cta", "Get A Free Quote"),
  v("request_a_job_booking_link", "https://api.example.test/widget/booking/job1"),
  v("request_a_quote_booking_link", "https://api.example.test/widget/booking/quote1"),
  v("business_google_profile_url", "https://share.example.test/profile"),
  v("google_review_request_url", "https://g.example.test/review"),
  v("business_logo", "https://assets.example.test/logo.svg"), v("business_favicon_url", "https://assets.example.test/fav.svg"),
  v("main_color", "#2E7D32"), v("text_on_main_color", "#FFFFFF"),
];

describe("business profile from the real key names", () => {
  it("reads every detail, including the booking and Google links", () => {
    expect(buildBrand(live).profile).toEqual({
      name: "Sample Lawn Co", owner: "Sam", phone: "+1 (555)-010-0000", email: "hello@sample.example",
      address: "1 Example Rd Town ST 00000", city: "Town", state: "ST", hours: "Open 24/7", keyword: null, websiteUrl: null,
      universalCta: "Get A Free Quote",
      bookingJobUrl: "https://api.example.test/widget/booking/job1", bookingQuoteUrl: "https://api.example.test/widget/booking/quote1",
      googleProfileUrl: "https://share.example.test/profile", googleReviewUrl: "https://g.example.test/review",
    });
  });

  it("keeps the brand fields in step with the profile", () => {
    const brand = buildBrand(live);
    expect(brand.businessName).toBe("Sample Lawn Co");
    expect(brand.ownerName).toBe("Sam");
    expect(brand.logoUrl).toBe("https://assets.example.test/logo.svg");
    expect(brand.faviconUrl).toBe("https://assets.example.test/fav.svg");
    expect(brand.cssVars["--main-color"]).toBe("#2e7d32");
  });

  it("accepts the design sample's key spellings for city and state, and prefers the live ones", () => {
    expect(buildBrand([v("business_main_city", "Columbus"), v("business_main_state_abbreviation", "OH")]).profile).toMatchObject({ city: "Columbus", state: "OH" });
    expect(buildBrand([v("business_main_city", "A"), v("business_address_city", "B")]).profile.city).toBe("B");
    expect(buildBrand([v("business_full_address", "X")]).profile.address).toBe("X");
  });

  it("falls back to the next spelling when the first is blank", () => {
    expect(buildBrand([v("business_address_city", "  "), v("business_main_city", "Dayton")]).profile.city).toBe("Dayton");
  });

  it("refuses links that are not https and trims text", () => {
    const profile = buildBrand([v("request_a_job_booking_link", "http://insecure.example.test/x"), v("google_review_request_url", "javascript:alert(1)"), v("business_name", "  Pad  ")]).profile;
    expect(profile.bookingJobUrl).toBeNull();
    expect(profile.googleReviewUrl).toBeNull();
    expect(profile.name).toBe("Pad");
  });

  it("is all null for a sub-account with no values, and never invents a value", () => {
    for (const value of Object.values(EMPTY_BRAND.profile)) expect(value).toBeNull();
  });
});
