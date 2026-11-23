import { describe, expect, it, vi } from "vitest";

// React's `cache` only memoizes inside a server render, so a simple memo stands in for one request.
const { getRequestUser, getBrand } = vi.hoisted(() => ({ getRequestUser: vi.fn(), getBrand: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return {
    ...real,
    cache: <R,>(fn: () => R) => {
      let stored: { value: R } | undefined;
      return () => (stored ??= { value: fn() }).value;
    },
  };
});
vi.mock("../../src/app/session", () => ({ getRequestUser }));
vi.mock("@/features/brand", () => {
  const EMPTY_BRAND = { cssVars: {}, logoUrl: null, faviconUrl: null, backgroundImageUrl: null, businessName: null, ownerName: null, profile: {}, rejected: [] };
  return { EMPTY_BRAND, brandScopeCss: () => "", brandStyle: () => ({}), getBrandService: () => ({ getBrand }) };
});

import RootLayout, { generateMetadata } from "../../src/app/layout";

describe("root layout brand lookup", () => {
  it("runs once for the metadata and the layout of one request", async () => {
    getRequestUser.mockResolvedValue({ tenantId: "T1", role: "owner" });
    getBrand.mockResolvedValue({ cssVars: {}, logoUrl: null, faviconUrl: null, backgroundImageUrl: null, businessName: "Sample Co", ownerName: null, profile: {}, rejected: [] });
    await generateMetadata();
    await RootLayout({ children: null });
    expect(getBrand).toHaveBeenCalledTimes(1);
  });
});
