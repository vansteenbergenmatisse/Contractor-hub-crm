import { describe, expect, it } from "vitest";
import { buildBusiness, businessValues } from "@/features/app-shell";

describe("buildBusiness", () => {
  it("builds initials, first name and the tag line", () => {
    expect(buildBusiness({ name: "Northway Roofing", owner: "Mike Dalton", keyword: "Roofing", city: "Columbus", state: "OH" })).toMatchObject({
      name: "Northway Roofing", init: "NR", tag: "Roofing · Columbus, OH", owner: "Mike Dalton", ownerInit: "MD", first: "Mike",
    });
  });

  it("falls back to plain words for empty or blank values and never throws", () => {
    const b = buildBusiness({ name: "  ", owner: null });
    expect(b.name).toBe("Your business");
    expect(b.owner).toBe("Owner");
    expect(b.first).toBe("Owner");
    expect(b.tag).toBe("");
  });

  it("copes with a one word name and a missing state", () => {
    expect(buildBusiness({ name: "Acme", keyword: "Lawn", city: "Dayton" })).toMatchObject({ init: "A", tag: "Lawn · Dayton" });
  });
});

describe("buildBusiness: details from the custom values", () => {
  const full = buildBusiness({
    name: "Sample Lawn Co", owner: "Sam", city: "Town", state: "ST", phone: "+1 555 0100", email: "hello@sample.example",
    address: "1 Example Rd", hours: "Open 24/7", websiteUrl: "https://www.sample.example/path", universalCta: "Get A Free Quote",
    logoUrl: "https://assets.example.test/l.svg", bookingJobUrl: "https://api.example.test/job", bookingQuoteUrl: "https://api.example.test/quote",
    googleProfileUrl: "https://share.example.test/p", googleReviewUrl: "https://g.example.test/r",
  });

  it("carries every detail and the logo link", () => {
    expect(full).toMatchObject({ phone: "+1 555 0100", email: "hello@sample.example", address: "1 Example Rd", hours: "Open 24/7", cta: "Get A Free Quote", logoUrl: "https://assets.example.test/l.svg", bookingJobUrl: "https://api.example.test/job", googleReviewUrl: "https://g.example.test/r" });
  });

  it("builds the tag from city and state when there is no keyword (a sub-account without business_main_keyword)", () => {
    expect(full.tag).toBe("Town, ST");
  });

  it("gives the website without https, www and path", () => {
    expect(full.site).toBe("sample.example");
    expect(buildBusiness({ websiteUrl: "not a url" }).site).toBe("");
    expect(buildBusiness({}).site).toBe("");
  });

  it("uses empty strings and nulls, never made-up values, for missing details", () => {
    const empty = buildBusiness({});
    expect(empty).toMatchObject({ phone: "", email: "", address: "", hours: "", cta: "", logoUrl: null, bookingJobUrl: null, websiteUrl: null });
  });

  it("maps to the custom-value key names, with blanks for the placeholders", () => {
    expect(businessValues(full)).toMatchObject({ business_name: "Sample Lawn Co", business_owner_name: "Sam", business_phone_number: "+1 555 0100", business_main_city: "Town", business_website_url: "https://www.sample.example/path" });
    expect(businessValues(buildBusiness({}))).toMatchObject({ business_name: "", business_owner_name: "", business_phone_number: "" });
  });
});
