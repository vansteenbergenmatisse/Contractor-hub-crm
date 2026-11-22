import { beforeEach, describe, expect, it, vi } from "vitest";

// The business details the frame and pages show, read through the brand cache. Only the HighLevel
// read is replaced; the brand service, mapping and app-shell builder are the real ones.
const { listTenantCustomValues } = vi.hoisted(() => ({ listTenantCustomValues: vi.fn() }));
vi.mock("@/features/highlevel", () => ({ listTenantCustomValues }));

import { buildBusiness } from "@/features/app-shell";
import { businessFromBrand, buildBrand, EMPTY_BRAND, getBrandService, getTenantCustomValues, loadBusiness } from "@/features/brand";

// Made-up values (no real client data).
const v = (key: string, value: string) => ({ key, value });
const values = [
  v("business_name", "Sample Lawn Co"), v("business_owner_name", "Sam Example"), v("business_phone_number", "+1 (555)-010-0000"),
  v("business_address_city", "Town"), v("business_address_state", "ST"),
  v("business_logo", "https://assets.example.test/logo.svg"),
  v("request_a_job_booking_link", "https://api.example.test/widget/booking/job1"),
];

let tenant = 0;
const nextTenant = () => `tenant-${++tenant}`;

beforeEach(() => vi.clearAllMocks());

describe("businessFromBrand", () => {
  it("maps the brand profile and logo into the business details", () => {
    const brand = buildBrand(values);
    const p = brand.profile;
    expect(businessFromBrand(brand, "Fallback")).toEqual(
      buildBusiness({
        name: p.name, owner: p.owner, keyword: p.keyword, city: p.city, state: p.state, phone: p.phone, email: p.email,
        address: p.address, hours: p.hours, websiteUrl: p.websiteUrl, universalCta: p.universalCta, logoUrl: brand.logoUrl,
        bookingJobUrl: p.bookingJobUrl, bookingQuoteUrl: p.bookingQuoteUrl, googleProfileUrl: p.googleProfileUrl,
        googleReviewUrl: p.googleReviewUrl,
      }),
    );
    expect(businessFromBrand(brand, "Fallback").name).toBe("Sample Lawn Co");
    expect(businessFromBrand(brand, "Fallback").owner).toBe("Sam Example");
  });

  it("uses the fallback owner when the profile has none", () => {
    expect(businessFromBrand(EMPTY_BRAND, "Signed In Person").owner).toBe("Signed In Person");
  });
});

describe("loadBusiness", () => {
  it("reads the tenant's custom values and builds the business", async () => {
    listTenantCustomValues.mockResolvedValue(values);
    const id = nextTenant();
    const business = await loadBusiness(id, "Fallback");
    expect(listTenantCustomValues).toHaveBeenCalledWith(id);
    expect(business.name).toBe("Sample Lawn Co");
    expect(business.logoUrl).toBe("https://assets.example.test/logo.svg");
  });

  it("falls back to plain details with the fallback owner when HighLevel fails", async () => {
    listTenantCustomValues.mockRejectedValue(new Error("down"));
    expect(await loadBusiness(nextTenant(), "Signed In Person")).toEqual(buildBusiness({ owner: "Signed In Person" }));
  });
});

describe("getTenantCustomValues", () => {
  it("returns the tenant's raw custom values", async () => {
    listTenantCustomValues.mockResolvedValue(values);
    const id = nextTenant();
    expect(await getTenantCustomValues(id)).toEqual(values);
    expect(listTenantCustomValues).toHaveBeenCalledWith(id);
  });

  it("shares the brand cache: a brand read and a values read fetch once", async () => {
    listTenantCustomValues.mockResolvedValue(values);
    const id = nextTenant();
    await getBrandService().getBrand(id);
    await getTenantCustomValues(id);
    await loadBusiness(id, "x");
    expect(listTenantCustomValues).toHaveBeenCalledTimes(1);
  });

  it("rejects when HighLevel fails, so the caller can tell 'not readable' from 'empty'", async () => {
    listTenantCustomValues.mockRejectedValue(new Error("down"));
    await expect(getTenantCustomValues(nextTenant())).rejects.toThrow("down");
  });

  it("reads fresh values after the tenant's cache is invalidated", async () => {
    const id = nextTenant();
    listTenantCustomValues.mockResolvedValueOnce(values).mockResolvedValueOnce([v("business_name", "Renamed")]);
    await getTenantCustomValues(id);
    getBrandService().invalidate(id);
    expect(await getTenantCustomValues(id)).toEqual([v("business_name", "Renamed")]);
  });
});

describe("loadBusiness error path", () => {
  it("builds the plain details with the fallback owner when the brand lookup itself throws", async () => {
    const spy = vi.spyOn(getBrandService(), "getBrand").mockRejectedValueOnce(new Error("boom"));
    const business = await loadBusiness(nextTenant(), "Signed In Person");
    expect(business).toEqual(buildBusiness({ owner: "Signed In Person" }));
    expect(business.owner).toBe("Signed In Person");
    expect(business.phone).toBe("");
    expect(business.logoUrl).toBeNull();
    spy.mockRestore();
  });

  it("success maps every detail the profile has, and the owner wins over the fallback", async () => {
    listTenantCustomValues.mockResolvedValue(values);
    const business = await loadBusiness(nextTenant(), "Fallback");
    expect(business).toMatchObject({ name: "Sample Lawn Co", owner: "Sam Example", phone: "+1 (555)-010-0000", city: "Town", state: "ST", logoUrl: "https://assets.example.test/logo.svg" });
  });
});
