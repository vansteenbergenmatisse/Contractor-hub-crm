import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// The manifest and home-screen icon routes. The brand's pure helpers are the real ones; the session,
// the brand lookup, the logo fetch and the PNG renderer are replaced.
const { getRequestUser, getBrand, fetchLogoDataUri, ImageResponse } = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  getBrand: vi.fn(),
  fetchLogoDataUri: vi.fn(),
  ImageResponse: vi.fn(function (this: Record<string, unknown>, element: unknown, options: { headers?: Record<string, string> }) {
    this.element = element;
    this.options = options;
    this.headers = new Headers(options.headers);
  }),
}));
vi.mock("../../src/app/session", () => ({ getRequestUser }));
vi.mock("next/og", () => ({ ImageResponse }));
vi.mock("@/features/brand", async () => {
  const build = await import("../../src/features/brand/api/build-brand");
  const manifest = await import("../../src/features/brand/api/manifest");
  return {
    EMPTY_BRAND: build.EMPTY_BRAND,
    buildManifest: manifest.buildManifest,
    parseIconRequest: manifest.parseIconRequest,
    getBrandService: () => ({ getBrand }),
    fetchLogoDataUri,
  };
});

import { buildBrand } from "../../src/features/brand/api/build-brand";
import { GET as manifestGET } from "../../src/app/api/manifest/route";
import { GET as iconGET } from "../../src/app/api/pwa-icon/route";

// Made-up values (no real client data).
const v = (key: string, value: string) => ({ key, value });
const tenantBrand = buildBrand([v("business_name", "Sample Lawn Co"), v("main_color", "#1B5E20"), v("text_on_main_color", "#FFFFFF"), v("business_logo", "https://assets.example.test/logo.svg")]);

beforeEach(() => {
  vi.clearAllMocks();
  getBrand.mockResolvedValue(tenantBrand);
});

describe("GET /api/manifest", () => {
  it("answers the signed-in tenant's manifest, private and uncached, as a manifest", async () => {
    getRequestUser.mockResolvedValue({ tenantId: "T1" });
    const res = await manifestGET();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-type")).toBe("application/manifest+json");
    expect(getBrand).toHaveBeenCalledWith("T1");
    expect(await res.json()).toMatchObject({ name: "Sample Lawn Co", theme_color: "#1b5e20" });
  });

  it("answers the neutral manifest when signed out, without a brand lookup", async () => {
    getRequestUser.mockResolvedValue(null);
    const res = await manifestGET();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(getBrand).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ name: "Contractor Hub CRM", theme_color: "#2e7d32" });
  });

  it("answers the neutral manifest when the brand lookup throws", async () => {
    getRequestUser.mockResolvedValue({ tenantId: "T1" });
    getBrand.mockRejectedValue(new Error("down"));
    const res = await manifestGET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "Contractor Hub CRM" });
  });
});

type Rendered = { element: ReactElement<{ children: ReactElement<Record<string, unknown>>; style: { background: string } }>; headers: Headers; options: { width: number } };
const icon = async (query = "size=192") => (await iconGET(new Request(`https://crm.example.test/api/pwa-icon?${query}`))) as unknown as Rendered;

describe("GET /api/pwa-icon", () => {
  it("fetches the logo through fetchLogoDataUri and draws the data URI, never the raw link", async () => {
    getRequestUser.mockResolvedValue({ tenantId: "T1" });
    fetchLogoDataUri.mockResolvedValue("data:image/png;base64,AAAA");
    const r = await icon("size=512");
    expect(fetchLogoDataUri).toHaveBeenCalledWith("https://assets.example.test/logo.svg");
    const inner = r.element.props.children;
    expect(inner.type).toBe("img");
    expect(inner.props.src).toBe("data:image/png;base64,AAAA");
    expect(JSON.stringify(r.element)).not.toContain("https://assets.example.test/logo.svg");
    expect(r.element.props.style.background).toBe("#1b5e20");
    expect(r.options.width).toBe(512);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
  });

  it("draws the initials and no image when the logo fails the checks", async () => {
    getRequestUser.mockResolvedValue({ tenantId: "T1" });
    fetchLogoDataUri.mockResolvedValue(null);
    const r = await icon();
    const inner = r.element.props.children;
    expect(inner.type).not.toBe("img");
    expect(inner.props.children).toBe("SL");
    expect(JSON.stringify(r.element)).not.toContain("https://assets.example.test/logo.svg");
  });

  it("is neutral and private when signed out or when the lookup throws", async () => {
    getRequestUser.mockResolvedValue(null);
    let r = await icon();
    expect(fetchLogoDataUri).not.toHaveBeenCalled();
    expect(r.element.props.style.background).toBe("#2e7d32");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    getRequestUser.mockResolvedValue({ tenantId: "T1" });
    getBrand.mockRejectedValue(new Error("down"));
    r = await icon();
    expect(r.element.props.style.background).toBe("#2e7d32");
    expect(r.element.props.children.props.children).toBe("C");
  });
});
