import { describe, expect, it } from "vitest";
import { buildBrand, buildManifest, EMPTY_BRAND, parseIconRequest } from "@/features/brand";

const v = (key: string, value: string) => ({ key, value });

describe("buildManifest", () => {
  it("names the app after the business and uses its colors", () => {
    const manifest = buildManifest(buildBrand([v("business_name", "Sample Lawn Co"), v("main_color", "#2E7D32"), v("text_on_main_color", "#FFFFFF"), v("background_color", "#F4F7F5")]));
    expect(manifest).toMatchObject({ name: "Sample Lawn Co", short_name: "Sample", start_url: "/", display: "standalone", theme_color: "#2e7d32", background_color: "#f4f7f5" });
  });

  it("shortens a long name for the home screen label", () => {
    expect(buildManifest(buildBrand([v("business_name", "Northern Landscaping And Snow Services")])).short_name).toBe("Northern");
  });

  it("lists PNG icons of 192 and 512 pixels, one of them maskable, all on our own icon route", () => {
    const icons = buildManifest(EMPTY_BRAND).icons;
    expect(icons.map((i) => i.sizes)).toEqual(["192x192", "512x512", "512x512"]);
    expect(icons.map((i) => i.purpose)).toEqual(["any", "any", "maskable"]);
    for (const icon of icons) {
      expect(icon.type).toBe("image/png");
      expect(icon.src.startsWith("/api/pwa-icon?")).toBe(true);
    }
  });

  it("is neutral for a sub-account with no values: no made-up business", () => {
    expect(buildManifest(EMPTY_BRAND)).toMatchObject({ name: "Contractor Hub CRM", theme_color: "#2e7d32", background_color: "#ffffff" });
  });

  it("never carries a color that failed validation", () => {
    expect(buildManifest(buildBrand([v("main_color", "red;background:url(x)")])).theme_color).toBe("#2e7d32");
  });
});

describe("parseIconRequest", () => {
  it("accepts only the listed sizes, defaulting to 192", () => {
    expect(parseIconRequest(new URLSearchParams("size=180")).size).toBe(180);
    expect(parseIconRequest(new URLSearchParams("size=512")).size).toBe(512);
    for (const bad of ["size=9999", "size=-1", "size=abc", "size=", ""]) expect(parseIconRequest(new URLSearchParams(bad)).size).toBe(192);
  });

  it("reads the maskable flag only when it is exactly 1", () => {
    expect(parseIconRequest(new URLSearchParams("size=512&maskable=1")).maskable).toBe(true);
    expect(parseIconRequest(new URLSearchParams("maskable=true")).maskable).toBe(false);
  });
});
