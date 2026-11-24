// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HIGHLEVEL_APP_HOME, highLevelSignInUrl, parseMenuUrlTemplate, resolveHighLevelSignIn } from "@/features/auth";
import { SignInForm } from "../../../src/features/auth/components/SignInForm";
import { frameHeaders, FRAME_DENIED_PATHS } from "@/shared/config/frame-headers";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// "Sign in with HighLevel": the operator's menu URL template (HIGHLEVEL_CRM_MENU_URL), never a guessed
// HighLevel address.
const TEMPLATE = "https://app.example-hl.test/v2/location/{locationId}/custom-menu-link/menu-1";

describe("the menu URL template", () => {
  it("accepts an https URL with exactly one {locationId}", () => {
    expect(parseMenuUrlTemplate(TEMPLATE)).toBe(TEMPLATE);
  });

  it.each([
    undefined,
    "",
    "https://app.example-hl.test/v2/location/abc/custom-menu-link/menu-1",
    "http://app.example-hl.test/v2/location/{locationId}",
    "https://user:pw@app.example-hl.test/{locationId}",
    "https://app.example-hl.test/{locationId}/{locationId}",
    "javascript:alert(1)//{locationId}",
    "not a url {locationId}",
  ])("refuses %s", (raw) => {
    expect(parseMenuUrlTemplate(raw)).toBeNull();
  });
});

describe("the button's target", () => {
  it("goes straight to the client's CRM page when the location is known", () => {
    expect(highLevelSignInUrl({ template: TEMPLATE, locationId: "loc_AB12" })).toEqual({
      href: "https://app.example-hl.test/v2/location/loc_AB12/custom-menu-link/menu-1",
      direct: true,
    });
  });

  it("goes to the same HighLevel host's home when the client is not known", () => {
    expect(highLevelSignInUrl({ template: TEMPLATE, locationId: null })).toEqual({ href: "https://app.example-hl.test/", direct: false });
  });

  it("never puts an odd location id in the URL", () => {
    expect(highLevelSignInUrl({ template: TEMPLATE, locationId: "../../evil?x=1" }).direct).toBe(false);
  });

  it("falls back to HighLevel's app home without a usable template", () => {
    expect(highLevelSignInUrl({ template: undefined, locationId: "loc_1" })).toEqual({ href: HIGHLEVEL_APP_HOME, direct: false });
  });

  it("looks the slug up only when there is a template and a slug, and survives a failed lookup", async () => {
    const findLocationId = vi.fn(async () => "loc_9");
    expect((await resolveHighLevelSignIn(null, { template: TEMPLATE, findLocationId })).direct).toBe(false);
    expect((await resolveHighLevelSignIn("acme", { template: undefined, findLocationId })).href).toBe(HIGHLEVEL_APP_HOME);
    expect(findLocationId).not.toHaveBeenCalled();
    expect((await resolveHighLevelSignIn("acme", { template: TEMPLATE, findLocationId })).href).toContain("/location/loc_9/");
    const failing = vi.fn(async () => {
      throw new Error("db down");
    });
    expect(await resolveHighLevelSignIn("acme", { template: TEMPLATE, findLocationId: failing })).toEqual({ href: "https://app.example-hl.test/", direct: false });
  });
});

describe("the sign-in page with HighLevel", () => {
  it("makes Sign in with HighLevel the one filled action and keeps email and password as the second way", () => {
    render(<SignInForm highLevel={{ href: "https://app.example-hl.test/", direct: false }} />);
    const link = screen.getByRole("link", { name: "Sign in with HighLevel" });
    expect(link.getAttribute("href")).toBe("https://app.example-hl.test/");
    expect(link.className).toContain("is-fill");
    expect(screen.getByRole("button", { name: "Sign in" }).className).toContain("is-plain");
    expect(screen.getByText(/then tap CRM in the left menu/)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("says it opens the CRM page when it knows the client", () => {
    render(<SignInForm highLevel={{ href: "https://app.example-hl.test/v2/location/x/custom-menu-link/m", direct: true }} />);
    expect(screen.getByText(/HighLevel opens your CRM page/)).toBeInTheDocument();
  });

  it("keeps the old look without a HighLevel target", () => {
    render(<SignInForm />);
    expect(screen.queryByRole("link", { name: "Sign in with HighLevel" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" }).className).toContain("is-fill");
  });
});

describe("the device sign-in page is never framed", () => {
  it("is in the denied list and gets frame-ancestors 'none'", () => {
    expect(FRAME_DENIED_PATHS).toContain("device-sign-in");
    const rule = frameHeaders().find((r) => r.source.includes("device-sign-in") && r.headers.some((h) => h.value === "DENY"));
    expect(rule).toBeDefined();
  });
});
