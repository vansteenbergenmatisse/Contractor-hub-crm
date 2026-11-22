import { describe, expect, it, vi } from "vitest";
import {
  buildBrand,
  createSignInBrandLoader,
  parseClientSlug,
  signInPath,
  slugFromName,
  toPublicSignInBrand,
  uniqueSlug,
} from "@/features/brand";

const HOSTS = ["assets.cdn.filesafe.space"];
const LOGO = "https://assets.cdn.filesafe.space/x/logo.png";
const PHOTO = "https://assets.cdn.filesafe.space/x/hero.jpg";

const PRIVATE = {
  business_owner_name: "PRIVATE-OWNER",
  business_phone_number: "PRIVATE-PHONE",
  business_email: "private@example.test",
  business_address: "PRIVATE-ADDRESS",
  business_address_city: "PRIVATE-CITY",
  business_latitude: "PRIVATE-LAT",
  "0_webhook_url_form": "https://example.test/PRIVATE-WEBHOOK",
  universal_cta: "PRIVATE-CTA",
  business_favicon_url: "https://assets.cdn.filesafe.space/PRIVATE-FAVICON.png",
};

const values = (extra: Record<string, string> = {}) =>
  Object.entries({
    ...PRIVATE,
    business_name: "Sample Roofing",
    business_logo: LOGO,
    business_main_background_video_or_image: PHOTO,
    main_color: "#123456",
    text_on_main_color: "#ffffff",
    ...extra,
  }).map(([key, value]) => ({ key, value }));

const publicBrand = (extra: Record<string, string> = {}) => toPublicSignInBrand(buildBrand(values(extra)), "sample-roofing", HOSTS);

function loader(overrides: Partial<Parameters<typeof createSignInBrandLoader>[0]> = {}) {
  const findTenantId = vi.fn(async (slug: string) => (slug === "sample-roofing" ? "tenant-1" : null));
  const readValues = vi.fn(async () => values());
  let clock = 1_000;
  const load = createSignInBrandLoader({ findTenantId, readValues, now: () => clock, hosts: HOSTS, ...overrides });
  return { load, findTenantId, readValues, advance: (ms: number) => (clock += ms) };
}

describe("parseClientSlug", () => {
  it("accepts a readable slug", () => {
    expect(parseClientSlug("sample-roofing-2")).toBe("sample-roofing-2");
  });

  it.each([
    undefined,
    null,
    "",
    "UPPER",
    "-leading",
    "trailing-",
    "two--hyphens",
    "a b",
    "a/b",
    "../etc",
    "https://evil.test",
    "a%2fb",
    "<script>",
    "é",
    "x".repeat(61),
    ["sample-roofing"],
    { slug: "sample-roofing" },
  ])("refuses %j", (raw) => {
    expect(parseClientSlug(raw)).toBeNull();
  });
});

describe("slug generation", () => {
  it("makes a lowercase hyphenated slug from the business name", () => {
    expect(slugFromName("  JCR's Landscaping & Co.  ")).toBe("jcr-s-landscaping-co");
    expect(slugFromName("Café Müller")).toBe("cafe-muller");
  });

  it("falls back to a plain word for an empty or unusable name, never a location id", () => {
    expect(slugFromName(null)).toBe("client");
    expect(slugFromName("!!!")).toBe("client");
  });

  it("always produces a slug the parser accepts, also for a very long name", () => {
    const slug = uniqueSlug(slugFromName("word ".repeat(40)), new Set());
    expect(parseClientSlug(slug)).toBe(slug);
  });

  it("resolves collisions with a number", () => {
    expect(uniqueSlug("acme", new Set())).toBe("acme");
    expect(uniqueSlug("acme", new Set(["acme"]))).toBe("acme-2");
    expect(uniqueSlug("acme", new Set(["acme", "acme-2"]))).toBe("acme-3");
  });

  it("builds the link from the slug", () => {
    expect(signInPath("acme")).toBe("/sign-in?client=acme");
  });
});

describe("toPublicSignInBrand allowlist", () => {
  it("holds exactly the public fields", () => {
    const brand = publicBrand();
    expect(Object.keys(brand!).sort()).toEqual(["backgroundUrl", "client", "css", "logoUrl", "name"]);
    expect(brand).toMatchObject({ client: "sample-roofing", name: "Sample Roofing", logoUrl: LOGO, backgroundUrl: PHOTO });
    expect(brand!.css).toContain("--main-color:#123456");
  });

  it("carries no private value", () => {
    const output = JSON.stringify(publicBrand());
    for (const secret of Object.values(PRIVATE)) expect(output).not.toContain(secret);
    expect(output).not.toContain("PRIVATE");
  });

  it("is null when nothing public is usable", () => {
    expect(toPublicSignInBrand(buildBrand([]), "sample-roofing", HOSTS)).toBeNull();
  });
});

describe("injection and unsafe values", () => {
  it.each([
    "red",
    "#12345g",
    "#123456;background:url(https://evil.test)",
    "#123456}</style><script>alert(1)</script>",
    "url(https://evil.test)",
    "expression(alert(1))",
  ])("refuses the color %s", (color) => {
    const brand = publicBrand({ main_color: color });
    expect(brand!.css).not.toContain("--main-color");
    expect(brand!.css).not.toMatch(/evil|script|expression/);
  });

  it("refuses a main color that fails the contrast rule, and its on-main color with it", () => {
    const brand = publicBrand({ main_color: "#ffffff", text_on_main_color: "#fefefe", sub_color: "#222222" });
    expect(brand!.css).not.toContain("--main-color");
    expect(brand!.css).not.toContain("--text-on-main-color");
    expect(brand!.css).toContain("--sub-color:#222222");
  });

  it("drops a custom on-main color when there is no main color to pair it with", () => {
    const brand = publicBrand({ main_color: "", text_on_main_color: "#000000", sub_color: "#222222" });
    expect(brand!.css).not.toContain("--text-on-main-color");
  });

  it.each([
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "http://assets.cdn.filesafe.space/x/logo.png",
    "https://evil.test/logo.png",
    "https://user:pass@assets.cdn.filesafe.space/x/logo.png",
    "https://assets.cdn.filesafe.space:8443/x/logo.png",
    "https://assets.cdn.filesafe.space.evil.test/logo.png",
  ])("refuses the image URL %s", (url) => {
    const brand = publicBrand({ business_logo: url, business_main_background_video_or_image: url });
    expect(brand!.logoUrl).toBeNull();
    expect(brand!.backgroundUrl).toBeNull();
  });

  it("cannot break out of a CSS url through quotes or parentheses", () => {
    const brand = publicBrand({ business_logo: `${LOGO}?x=");background:url(https://evil.test)` });
    expect(brand!.logoUrl ?? "").not.toContain('"');
  });

  it("keeps a hostile business name as data with no control characters and a length cap", () => {
    const brand = publicBrand({ business_name: `<img src=x onerror=alert(1)>\u0000${"x".repeat(300)}` });
    expect(brand!.name).not.toContain("\u0000");
    expect(brand!.name!.length).toBeLessThanOrEqual(80);
  });
});

describe("background is an image or nothing", () => {
  it.each(["hero.png", "hero.jpg", "hero.JPEG", "hero.webp", "hero.avif", "hero.gif"])("shows %s", (file) => {
    const url = `https://assets.cdn.filesafe.space/x/${file}`;
    expect(publicBrand({ business_main_background_video_or_image: url })!.backgroundUrl).toBe(url);
  });

  it.each(["hero.mp4", "hero.webm", "hero.mov", "hero.svg", "hero", "page.html", "hero.jpg.mp4"])("shows no background for %s", (file) => {
    const url = `https://assets.cdn.filesafe.space/x/${file}`;
    expect(publicBrand({ business_main_background_video_or_image: url })!.backgroundUrl).toBeNull();
  });
});

describe("createSignInBrandLoader", () => {
  it("resolves a valid slug to public branding", async () => {
    const { load } = loader();
    expect(await load("sample-roofing")).toMatchObject({ client: "sample-roofing", name: "Sample Roofing" });
  });

  it.each([undefined, "", "BAD VALUE", "../x", ["sample-roofing"]])("makes no lookup for the malformed value %j", async (raw) => {
    const { load, findTenantId, readValues } = loader();
    expect(await load(raw)).toBeNull();
    expect(findTenantId).not.toHaveBeenCalled();
    expect(readValues).not.toHaveBeenCalled();
  });

  it("gives null for an unknown slug without reading custom values", async () => {
    const { load, readValues } = loader();
    expect(await load("nobody-here")).toBeNull();
    expect(readValues).not.toHaveBeenCalled();
  });

  it("gives null when the lookup says the tenant is not connected (uninstalled)", async () => {
    const { load, readValues } = loader({ findTenantId: vi.fn(async () => null) });
    expect(await load("sample-roofing")).toBeNull();
    expect(readValues).not.toHaveBeenCalled();
  });

  it("gives null when the table is missing or the database fails", async () => {
    const { load } = loader({ findTenantId: vi.fn(async () => { throw Object.assign(new Error("missing"), { code: "P2021" }); }) });
    await expect(load("sample-roofing")).resolves.toBeNull();
  });

  it("gives null when custom values cannot be read, and waits before trying HighLevel again", async () => {
    const readValues = vi.fn(async () => { throw new Error("HighLevel down"); });
    const { load, advance } = loader({ readValues });
    expect(await load("sample-roofing")).toBeNull();
    expect(await load("sample-roofing")).toBeNull();
    expect(readValues).toHaveBeenCalledTimes(1);
    advance(61_000);
    await load("sample-roofing");
    expect(readValues).toHaveBeenCalledTimes(2);
  });

  it("gives null when a lookup hangs", async () => {
    const { load } = loader({ findTenantId: () => new Promise(() => {}), timeoutMs: 5 });
    expect(await load("sample-roofing")).toBeNull();
  });

  it("does not repeat the database lookup for the same slug inside a minute", async () => {
    const { load, findTenantId, advance } = loader();
    await load("nobody-here");
    await load("nobody-here");
    expect(findTenantId).toHaveBeenCalledTimes(1);
    advance(61_000);
    await load("nobody-here");
    expect(findTenantId).toHaveBeenCalledTimes(2);
  });

  it("caps database lookups for many different slugs and answers neutral above the cap", async () => {
    const { load, findTenantId } = loader({ maxLookupsPerMinute: 3 });
    for (let i = 0; i < 10; i += 1) expect(await load(`guess-${i}`)).toBeNull();
    expect(findTenantId).toHaveBeenCalledTimes(3);
  });

  it("never mixes two clients", async () => {
    const readValues = vi.fn(async (tenantId: string) => values({ business_name: tenantId === "t1" ? "One" : "Two" }));
    const findTenantId = vi.fn(async (slug: string) => (slug === "one" ? "t1" : "t2"));
    const { load } = loader({ readValues, findTenantId });
    expect((await load("one"))!.name).toBe("One");
    expect((await load("two"))!.name).toBe("Two");
    expect((await load("one"))!.client).toBe("one");
  });
});
