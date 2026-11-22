import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The root layout prints the tenant's install links. The manifest link must ask for credentials, or
// the browser fetches /api/manifest without the session cookie and every install gets the neutral app.
const { getRequestUser, getBrand } = vi.hoisted(() => ({ getRequestUser: vi.fn(), getBrand: vi.fn() }));
vi.mock("../../src/app/session", () => ({ getRequestUser }));
vi.mock("@/features/brand", async (importOriginal) => {
  const { brandScopeCss } = await importOriginal<typeof import("@/features/brand")>();
  const EMPTY_BRAND = { cssVars: {}, logoUrl: null, faviconUrl: null, backgroundImageUrl: null, businessName: null, ownerName: null, profile: {}, rejected: [] };
  return { EMPTY_BRAND, brandScopeCss, brandStyle: () => ({}), getBrandService: () => ({ getBrand }) };
});

import RootLayout from "../../src/app/layout";

const render = async () => renderToStaticMarkup(await RootLayout({ children: null }));

beforeEach(() => {
  vi.clearAllMocks();
  getBrand.mockResolvedValue({ cssVars: {}, logoUrl: null, faviconUrl: null, backgroundImageUrl: null, businessName: "Sample Co", ownerName: null, profile: {}, rejected: [] });
});

describe("root layout", () => {
  it("links the manifest with credentials for a tenant user", async () => {
    getRequestUser.mockResolvedValue({ tenantId: "T1", role: "owner" });
    const html = await render();
    expect(html).toMatch(/<link rel="manifest" href="\/api\/manifest" crossorigin="use-credentials"\/>/);
  });

  it("prints no manifest link when signed out", async () => {
    getRequestUser.mockResolvedValue(null);
    expect(await render()).not.toContain('rel="manifest"');
  });

  it("prints the tenant's colors as a rule that wins over the design defaults on .brand-scope", async () => {
    getRequestUser.mockResolvedValue({ tenantId: "T1", role: "owner" });
    getBrand.mockResolvedValue({ cssVars: { "--main-color": "#1565c0" }, logoUrl: null, faviconUrl: null, backgroundImageUrl: null, businessName: "Sample Co", ownerName: null, profile: {}, rejected: [] });
    expect(await render()).toContain(
      '<style id="brand-first-paint">:root:root:root,.brand-scope.brand-scope.brand-scope{--main-color:#1565c0}</style>',
    );
  });

  it("prints no brand rule when the tenant has no colors", async () => {
    getRequestUser.mockResolvedValue(null);
    expect(await render()).not.toContain("brand-first-paint");
  });
});
