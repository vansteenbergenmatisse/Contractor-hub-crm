import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeSignInHint, SIGN_IN_HINT_COOKIE } from "../../../src/features/auth/api/sign-in-hint";

// /sign-in reads the hint cookie server-side: with a known hint it names the masked email, links
// straight to that client's CRM page and explains the HighLevel password reset. Otherwise: as today.
const { loadSignInBrand, findLocationIdBySlug, jar } = vi.hoisted(() => ({
  loadSignInBrand: vi.fn(),
  findLocationIdBySlug: vi.fn(),
  jar: { value: undefined as string | undefined },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/features/brand", () => ({ loadSignInBrand }));
vi.mock("../../../src/features/auth/db/highlevel-sign-in", () => ({ findLocationIdBySlug }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === SIGN_IN_HINT_COOKIE && jar.value ? { name, value: jar.value } : undefined) }),
}));

import SignInPage from "../../../src/app/sign-in/page";

const TEMPLATE = "https://app.example-hl.test/v2/location/{locationId}/custom-menu-link/m";
const params = (value: Record<string, string | undefined>) => ({ searchParams: Promise.resolve(value) });
const render = async (value: Record<string, string | undefined> = {}) => renderToStaticMarkup(await SignInPage(params(value)));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.HIGHLEVEL_CRM_MENU_URL = TEMPLATE;
  loadSignInBrand.mockResolvedValue(null);
  findLocationIdBySlug.mockImplementation(async (slug: string) => (slug === "sample-roofing" ? "loc_1" : null));
  jar.value = undefined;
});
afterEach(() => {
  delete process.env.HIGHLEVEL_CRM_MENU_URL;
});

describe("/sign-in with the hint", () => {
  it("shows the masked email, the direct link and the forgot-password step", async () => {
    jar.value = encodeSignInHint({ slug: "sample-roofing", email: "john@gmail.com" });
    const html = await render();
    const text = html.replace(/<span[^>]*style="[^"]*"[^>]*>[^<]*<\/span>/g, "").replace(/<[^>]+>/g, "");
    expect(text).toContain("Sign in again with HighLevel. Use j•••@gmail.com.");
    expect(html).toContain('<span aria-hidden="true">j•••@gmail.com</span>');
    expect(html).toContain("email starting with j at gmail.com");
    expect(html).toContain('href="https://app.example-hl.test/v2/location/loc_1/custom-menu-link/m"');
    expect(html).toContain("Forgot that password? Reset it on the HighLevel login screen.");
    expect(html).not.toContain("Your sign-in has ended");
    expect(html).not.toContain("john");
    // The CRM's own password form stays, below the HighLevel way in.
    expect(html.indexOf("Sign in with HighLevel")).toBeLessThan(html.indexOf('name="password"'));
    expect(loadSignInBrand).toHaveBeenCalledWith("sample-roofing");
  });

  it("an unknown or invalid slug in the cookie gives the generic page", async () => {
    const plain = await render();
    jar.value = encodeSignInHint({ slug: "gone-client", email: "john@gmail.com" });
    expect(await render()).toBe(plain);
    jar.value = Buffer.from(JSON.stringify({ s: "https://evil.test", e: "j•••@gmail.com" })).toString("base64url");
    expect(await render()).toBe(plain);
    expect(plain).not.toContain("Your sign-in has ended");
  });
});
