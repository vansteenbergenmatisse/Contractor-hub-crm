// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    useShell: () => ({ updateBusiness: vi.fn(), signOut: vi.fn() }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { SettingsPage, classifyKey, initialState, isSecretValue,loadSettingsValues, settingsReadFrom, writeGuardOf, type AccountLayout, type SaveValues } from "@/features/settings";
import { LAYOUT, placeKey } from "../../../src/features/settings/api/layout";

// Review fixes for feat/settings-every-value (2026-11-24). Made-up keys and values only.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const page = (values: Record<string, string>, extra: Partial<React.ComponentProps<typeof SettingsPage>> = {}, account: AccountLayout = { imageHosts: [] }) =>
  render(<PageStateProvider><SettingsPage initialValues={values} account={account} {...extra} /></PageStateProvider>);

describe("the classifier refuses secret names the first list missed", () => {
  it.each([
    // passwords and keys
    "smtp_pass", "smtp_pwd", "Smtp_Pass2", "stripe_sk_live", "stripekey", "googlemapskey", "licensekey", "license_key2", "access_keys",
    // endpoints that leak data
    "zapier_hook_url", "hook_url", "callback_url", "n8n_endpoint", "form_endpoint", "database_url", "sentry_dsn",
    // tokens and codes
    "jwt", "hmac_salt", "ghl_pit", "otp", "pin_code", "recaptcha_sitekey",
    // personal and payment data
    "ssn", "tax_number", "ein", "card_number", "cvv",
    // auth words
    "key", "auth", "authorization", "AUTH_HEADER",
  ])("%s is secret", (key) => {
    expect(classifyKey(key)).toBe("secret");
    expect(settingsReadFrom([{ key, value: "made-up" }]).values).toEqual({});
  });

  it.each([
    // Plain words that only contain a denied word.
    "possession_text", "sessions_count", "designing_text", "business_pinterest_url", "review1_author", "business_main_keyword",
  ])("%s still shows", (key) => {
    expect(classifyKey(key)).toBe("shown");
  });

  it("shows every key the layout names", () => {
    for (const folder of LAYOUT) for (const group of folder.groups) for (const key of group.keys ?? []) expect(classifyKey(key), key).toBe("shown");
  });
});

describe("a secret-looking value is kept on the server whatever the key is called", () => {
  it.each([
    ["a Stripe key", "sk_live_madeup123456"],
    ["a restricted Stripe key", "rk_test_madeup123456"],
    ["a Zapier hook", "https://hooks.zapier.com/hooks/catch/123/abc/"],
    ["a Make hook", "https://hook.eu1.make.com/madeup"],
    ["an n8n hook", "https://madeup.app.n8n.cloud/webhook/abc"],
    ["a JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.madeupsig"],
    ["a Slack token", "xoxb-1234-madeup"],
    ["a GitHub token", "ghp_abcdefghijklmnopqrstuvwxyz0123"],
    ["a HighLevel private token", "pit-12345678-aaaa-bbbb-cccc-1234567890ab"],
    ["credentials in a link", "postgres://user:madeup@db.example/x"],
  ])("%s", (_name, value) => {
    expect(isSecretValue(value)).toBe(true);
    const read = settingsReadFrom([{ key: "business_main_x", value }, { key: "business_name", value: "Test Co" }]);
    expect(read.values).toEqual({ business_name: "Test Co" });
    expect(read.longKeys).toEqual([]);
    expect(read.hiddenKeys).toEqual(["business_main_x"]);
  });

  it("keeps ordinary values", () => {
    for (const value of ["", "Test Co", "https://a.example/page", "residential-services/lawn-care", "#2E7D32", "<p>Made-up page</p>", "skip_this"]) {
      expect(isSecretValue(value), value).toBe(false);
    }
  });

  it("also hides a long key whose value looks secret", () => {
    const read = settingsReadFrom([{ key: "seasonal_offer_text", value: `sk_live_${"a".repeat(2001)}` }]);
    expect(read.values).toEqual({});
    expect(read.longKeys).toEqual([]);
  });

  it("logs hidden key names (never values) so the next layout run knows they exist", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const values = await loadSettingsValues("tenant_1", async () => [
      { key: "business_name", value: "Test Co" },
      { key: "gtm_id", value: "GTM-MADEUP" },
      { key: "business_main_x", value: "sk_live_madeup123456" },
    ]);
    expect(values).toEqual({ business_name: "Test Co" });
    expect(warn).toHaveBeenCalledWith("Settings layout: hidden keys=business_main_x,gtm_id");
    expect(warn.mock.calls.flat().join(" ")).not.toMatch(/GTM-MADEUP|sk_live/);
  });
});

describe("which keys the server lets a save write", () => {
  it("protected folder keys need that folder's unlock; page text elsewhere is read-only", () => {
    expect(writeGuardOf("business_name")).toEqual({ kind: "open" });
    expect(writeGuardOf("brand_new_value")).toEqual({ kind: "open" });
    expect(writeGuardOf("residentialservice1")).toEqual({ kind: "folder", folder: "res" });
    expect(writeGuardOf("residentialservice1content")).toEqual({ kind: "folder", folder: "res" });
    expect(writeGuardOf("bizarea1path")).toEqual({ kind: "folder", folder: "area" });
    expect(writeGuardOf("servicetype01")).toEqual({ kind: "folder", folder: "typ" });
    expect(writeGuardOf("stray_pagecontent")).toEqual({ kind: "read-only" });
  });
});

describe("layout fixes", () => {
  it("places the main city and county in either spelling order", () => {
    expect(placeKey("bizarea00citymain")?.group.id).toBe("main");
    expect(placeKey("bizarea00countymaincontent")?.group.id).toBe("main");
    expect(placeKey("bizarea00maincity")?.group.id).toBe("main");
  });

  it("never makes a numbered item 0", () => {
    expect(placeKey("bizarea00")?.item ?? null).not.toBe(0);
    expect(placeKey("residentialservice0")?.item ?? null).not.toBe(0);
  });
});

describe("the page", () => {
  const VALUES = { business_name: "Test Co", business_phone_number: "", main_color: "#2E7D32", text_on_main_color: "#FFFFFF", partner1_name: "", brand_new_value: "" };

  it("keeps step numbers and the step count while searching", () => {
    page(VALUES);
    expect(within(document.getElementById("s-card-col") as HTMLElement).getByText("Step 2 of 4")).toBeInTheDocument();
    cleanup();
    page(VALUES, { initial: { ...initialState(VALUES), q: "Main color", open: true } });
    expect(document.getElementById("s-card-biz")).toBeNull();
    expect(within(document.getElementById("s-card-col") as HTMLElement).getByText("Step 2 of 4")).toBeInTheDocument();
    expect(screen.getByText("Your business details in 4 steps, all on one page. Fill them top to bottom and save each step.")).toBeInTheDocument();
    expect(screen.getByText("Your details in 4 steps")).toBeInTheDocument();
  });

  it("leaves long values out of Only show empty fields", async () => {
    const user = userEvent.setup();
    page({ business_name: "Test Co", business_phone_number: "" }, {}, { imageHosts: [], longKeys: ["seasonal_offer_text"] });
    expect(screen.getByLabelText("Seasonal offer text")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Only show empty fields" }));
    expect(screen.queryByLabelText("Seasonal offer text")).toBeNull();
    expect(screen.getByLabelText("Phone")).toBeInTheDocument();
  });

  it("saves a newly shown key from its step", async () => {
    const user = userEvent.setup();
    const send = vi.fn<SaveValues>(async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "saved" as const })) }));
    page(VALUES, { saveValues: send });
    const more = within(document.getElementById("s-card-more") as HTMLElement);
    await user.type(more.getByLabelText("Brand new value"), "Made-up");
    await user.click(more.getByRole("button", { name: /^Save/ }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual([[{ key: "brand_new_value", expected: "", value: "Made-up" }]]);
  });

  it("sends the folder's unlock with a protected folder save", async () => {
    const user = userEvent.setup();
    const send = vi.fn<SaveValues>(async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "saved" as const })) }));
    page({ business_name: "Test Co", residentialservice1: "Mowing" }, { saveValues: send });
    await user.click(screen.getByRole("button", { name: "Unlock Residential services to change" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await user.type(screen.getByLabelText("Residential service 1"), "x");
    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    await user.click(screen.getByRole("button", { name: "Save Residential services" }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual([[{ key: "residentialservice1", expected: "Mowing", value: "Mowingx" }], { unlocked: "res" }]);
  });
});
