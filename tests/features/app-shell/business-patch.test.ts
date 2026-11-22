import { describe, expect, it } from "vitest";
import { buildBusiness, patchBusiness, type BusinessPatch } from "@/features/app-shell";

const base = buildBusiness({
  name: "Sample Roofing", owner: "Pat Lee", keyword: "Roofing", city: "Dayton", state: "OH",
  phone: "+1 555 0100", websiteUrl: "https://www.sample.example", logoUrl: "https://assets.example.test/l.svg",
  bookingJobUrl: "https://api.example.test/job", universalCta: "Get A Quote",
});

describe("patchBusiness", () => {
  it("returns the same details for an empty patch", () => {
    expect(patchBusiness(base, {})).toEqual(base);
  });

  it("recomputes the initials when the name changes", () => {
    const b = patchBusiness(base, { name: "Northway Lawn Care" });
    expect(b.name).toBe("Northway Lawn Care");
    expect(b.init).toBe("NL");
    expect(b.phone).toBe("+1 555 0100");
  });

  it("recomputes the owner's initials, first name, tag and site", () => {
    const b = patchBusiness(base, { owner: "Sam Ortiz", city: "Columbus", keyword: "", websiteUrl: "https://new.example/x" });
    expect(b).toMatchObject({ owner: "Sam Ortiz", ownerInit: "SO", first: "Sam", tag: "Columbus, OH", site: "new.example", keyword: "" });
  });

  it("blanks a link to null for an empty string or null, and a text field to an empty string", () => {
    const b = patchBusiness(base, { logoUrl: "", bookingJobUrl: null, phone: "" });
    expect(b.logoUrl).toBeNull();
    expect(b.bookingJobUrl).toBeNull();
    expect(b.phone).toBe("");
    const nulled = patchBusiness(base, { phone: null } as unknown as BusinessPatch);
    expect(nulled.phone).toBe("");
  });

  it("falls back to the plain word when the name is blanked", () => {
    expect(patchBusiness(base, { name: "" }).name).toBe("Your business");
  });

  it("keeps the call to action", () => {
    expect(patchBusiness(base, { cta: "Book now" }).cta).toBe("Book now");
    expect(patchBusiness(base, {}).cta).toBe("Get A Quote");
  });

  it("ignores derived and unknown fields", () => {
    const b = patchBusiness(base, { init: "ZZ", site: "evil.example", nonsense: "x" } as unknown as BusinessPatch);
    expect(b).toEqual(base);
    expect(b).not.toHaveProperty("nonsense");
  });
});
