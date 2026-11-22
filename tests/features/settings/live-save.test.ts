import { describe, expect, it } from "vitest";
import { applyBrandVars, brandCssVars, businessPatchFromValues, sectionFromParam } from "@/features/settings";

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
      address: "1 Test St", hours: "Mon-Fri 8-5", websiteUrl: "https://test.example", logoUrl: "https://cdn.test.example/logo.png",
      bookingJobUrl: "https://book.test.example/job", bookingQuoteUrl: "https://book.test.example/quote",
      googleProfileUrl: "https://g.test.example/profile", googleReviewUrl: "https://g.test.example/review",
    });
  });

  it("keeps blanks blank and never invents a value", () => {
    const p = businessPatchFromValues({});
    expect(p).toEqual({
      name: "", owner: "", phone: "", email: "", address: "", hours: "", websiteUrl: null, logoUrl: null,
      bookingJobUrl: null, bookingQuoteUrl: null, googleProfileUrl: null, googleReviewUrl: null,
    });
  });

  it("accepts https links only", () => {
    const p = businessPatchFromValues({ business_logo: "http://x.example/a.png", business_website_url: "javascript:alert(1)" });
    expect(p.logoUrl).toBeNull();
    expect(p.websiteUrl).toBeNull();
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
