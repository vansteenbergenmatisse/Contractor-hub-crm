import { describe, expect, it } from "vitest";
import { applyBrandVars, brandCssVars, brandScopeRule, businessPatchFromValues, sectionFromParam } from "@/features/settings";

// Made-up values only.
describe("businessPatchFromValues", () => {
  it("maps the custom values to the shell's business fields", () => {
    const p = businessPatchFromValues({
      business_name: " Test Roofing Co ", business_owner_name: "Sam Tester", business_phone_number: "+1 (555) 010-0000",
      business_email: "office@test.example", business_address: "1 Test St", business_hours: "Mon-Fri 8-5",
      business_website_url: "https://test.example", business_logo: "https://cdn.test.example/logo.png",
      request_a_job_booking_link: "https://book.test.example/job", request_a_quote_booking_link: "https://book.test.example/quote",
      business_google_profile_url: "https://g.test.example/profile", google_review_request_url: "https://g.test.example/review",
      main_color: "#112233",
    });
    expect(p).toEqual({
      name: "Test Roofing Co", owner: "Sam Tester", phone: "+1 (555) 010-0000", email: "office@test.example",
      address: "1 Test St", hours: "Mon-Fri 8-5", websiteUrl: "https://test.example/", logoUrl: "https://cdn.test.example/logo.png",
      bookingJobUrl: "https://book.test.example/job", bookingQuoteUrl: "https://book.test.example/quote",
      googleProfileUrl: "https://g.test.example/profile", googleReviewUrl: "https://g.test.example/review",
    });
  });

  it("leaves empty fields out, so an empty value never overrides what the shell shows (never invents one)", () => {
    expect(businessPatchFromValues({})).toEqual({});
    const p = businessPatchFromValues({ business_name: "Test Co", business_owner_name: "  ", business_phone_number: "", business_logo: "" });
    expect(p).toEqual({ name: "Test Co" });
    expect("owner" in p).toBe(false);
  });

  it("sends the seasonal offer, the referral reward and the county when filled, and leaves them out when empty", () => {
    const p = businessPatchFromValues({
      seasonal_offer_text: " 10% off gutter cleaning this fall ", referral_reward_text: "A $50 test gift card",
      business_main_county: "Test County",
    });
    expect(p).toEqual({ seasonalOffer: "10% off gutter cleaning this fall", referralReward: "A $50 test gift card", county: "Test County" });
    const empty = businessPatchFromValues({ seasonal_offer_text: "  ", referral_reward_text: "", business_main_county: " " });
    expect(empty).toEqual({});
    expect("seasonalOffer" in empty || "referralReward" in empty || "county" in empty).toBe(false);
  });

  it("accepts https links only", () => {
    const p = businessPatchFromValues({ business_logo: "http://x.example/a.png", business_website_url: "javascript:alert(1)" });
    expect(p.logoUrl).toBeUndefined();
    expect(p.websiteUrl).toBeUndefined();
  });

  it("sends a link only in its parsed form, so a quote can never end a CSS url(\"...\")", () => {
    const p = businessPatchFromValues({
      business_logo: 'https://a.test.example/x"),url("https://tracker.test.example/p',
      business_website_url: "https://exa mple.test", google_review_request_url: "HTTPS://G.TEST.EXAMPLE/r",
    });
    expect(p.logoUrl).toBe("https://a.test.example/x%22),url(%22https://tracker.test.example/p");
    expect(p.logoUrl).not.toContain('"');
    expect(p.websiteUrl).toBeUndefined();
    expect(p.googleReviewUrl).toBe("https://g.test.example/r");
    expect(businessPatchFromValues({ business_logo: "https://" }).logoUrl).toBeUndefined();
  });
});

describe("brandCssVars", () => {
  it("maps each valid color key to its CSS variable and text_color to --normal-text-color too", () => {
    const v = brandCssVars({ main_color: "#1B5E20", text_color: "#111111", sub_color: "#abc", business_name: "Test Co" });
    expect(v).toEqual({ "--main-color": "#1B5E20", "--text-color": "#111111", "--normal-text-color": "#111111", "--sub-color": "#abc" });
  });

  it("drops anything that is not a hex color", () => {
    const v = brandCssVars({ main_color: "red;position:fixed;inset:0", border_color: "url(https://x.example)", error_color: "#12345" });
    expect(v).toEqual({});
  });
});

describe("applyBrandVars", () => {
  it("sets only the validated variables on the root element", () => {
    const set: [string, string][] = [];
    const root = { style: { setProperty: (k: string, v: string) => void set.push([k, v]) } };
    applyBrandVars(root, { main_color: "#1B5E20", highlight_color: "bad;x:y", text_color: "#222222" });
    expect(set).toEqual([["--main-color", "#1B5E20"], ["--text-color", "#222222"], ["--normal-text-color", "#222222"]]);
  });
});

describe("brandScopeRule", () => {
  // globals.css declares the default colors again on every `.brand-scope` element, so a variable set
  // on <html> alone never reaches the app. The rule names `.brand-scope` with a higher specificity.
  it("puts the validated colors on <html> and on every .brand-scope element, beating the defaults", () => {
    const css = brandScopeRule({ main_color: "#1565C0", text_color: "#222222", sub_color: "bad;}body{x:y" });
    expect(css).toBe(":root:root:root,.brand-scope.brand-scope.brand-scope{--main-color:#1565C0;--text-color:#222222;--normal-text-color:#222222}");
    expect(css).not.toContain("bad");
  });
  it("is empty when no color is valid", () => {
    expect(brandScopeRule({ main_color: "", border_color: "red" })).toBe("");
  });
});

describe("sectionFromParam", () => {
  it("maps the URL names to the sections", () => {
    expect(sectionFromParam("connections")).toBe("conn");
    expect(sectionFromParam("business")).toBe("biz");
    expect(sectionFromParam("colors")).toBe("colors");
    expect(sectionFromParam("choices")).toBe("choice");
    expect(sectionFromParam("soon")).toBe("soon");
    expect(sectionFromParam(["connections", "colors"])).toBe("conn");
  });
  it("gives null for anything else", () => {
    for (const v of [undefined, "", "Connections ", "conn", "admin", "__proto__", "toString", []]) expect(sectionFromParam(v)).toBeNull();
  });
});
