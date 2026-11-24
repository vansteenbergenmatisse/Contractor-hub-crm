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
import { SettingsPage, classifyKey, isLinkKey, loadSettingsValues, settingsReadFrom, type AccountLayout, type SaveValues } from "@/features/settings";
import { isSafeToWrite } from "../../../src/features/settings-write-back/api/value-rules";
import { LAYOUT, arrangeKeys, placeKey, unplacedKeys } from "../../../src/features/settings/api/layout";
import { arrangeSteps } from "../../../src/features/settings/api/steps";

afterEach(cleanup);

// A synthetic account with the key SHAPES of the "Landscaping Core v2.0" snapshot: 16 folders, 320
// keys, every value blank. Partner, review and our-work key names are guesses (see layout.ts).
const range = (n: number, from = 1) => Array.from({ length: n }, (_, i) => i + from);
const pad = (n: number) => String(n).padStart(2, "0");
const ESSENTIALS = [
  "0_webhook_url_form", "business_name", "business_owner_name", "business_phone_number", "business_email", "business_address",
  "business_address_city", "business_address_state", "business_hours", "business_hours_weekdays_open", "business_hours_weekdays_close",
  "business_hours_saturday_open", "business_hours_saturday_close", "business_hours_sunday_open", "business_hours_sunday_close",
  "business_latitude", "business_longitude", "business_logo", "business_favicon_url", "universal_cta", "business_main_keyword",
  "business_main_city", "business_main_state_abbreviation", "business_website_url", "business_main_background_video_or_image",
];
const SOCIAL = ["business_facebook_url", "business_instagram_url", "business_yelp_url", "business_youtube_url"];
const GOOGLE = ["business_google_profile_url", "google_review_request_url", "bbb_review_request_url", "_google_maps_embed_src"];
const BOOKING = ["request_a_job_booking_link", "request_a_quote_booking_link"];
const BRANDING = [
  "main_color", "main_hover_color", "main_light_color", "main_background_color", "main_border_color", "sub_color", "highlight_color",
  "error_color", "background_color", "section_background_color", "border_color", "text_color", "light_text_color", "text_on_main_color",
];
const service = (prefix: string, padded: boolean) => [
  ...(padded ? [] : [`${prefix}00content`]),
  ...range(padded ? 10 : 20).flatMap((n) => { const k = `${prefix}${padded ? pad(n) : n}`; return [k, `${k}content`, `${k}path`]; }),
];
const TYPES = ["0_servicetypename", ...service("servicetype", true)];
const AREAS = [
  "bizarea00maincity", "bizarea00maincitycontent", "bizarea00maincounty", "bizarea00maincountycontent", "bizarea00maincountypath",
  ...range(25).flatMap((n) => [`bizarea${n}`, `bizarea${n}content`, `bizarea${n}path`]),
];
const PARTNERS = ["partners_title", ...range(3).flatMap((n) => [`partner${n}_name`, `partner${n}_logo`])];
const REVIEWS = range(6).flatMap((n) => [`review${n}_name`, `review${n}_text`, `review${n}_stars`]);
const WORK = range(6).flatMap((n) => [`${n}_our_work_before`, `${n}_our_work_after`]);
const ALL_KEYS = [
  ...ESSENTIALS, ...SOCIAL, ...GOOGLE, ...BOOKING, ...BRANDING, ...service("residentialservice", false), ...service("commercialservice", false),
  ...TYPES, ...AREAS, ...PARTNERS, ...REVIEWS, ...WORK, "brand_new_value",
];
const SECRETS = ["0_webhook_url_form", "_google_maps_embed_src", "0_servicetypename"];

const page = (values: Record<string, string>, account: AccountLayout = { imageHosts: [] }, extra: Partial<React.ComponentProps<typeof SettingsPage>> = {}) =>
  render(<PageStateProvider><SettingsPage initialValues={values} account={account} {...extra} /></PageStateProvider>);
const card = (id: string) => within(document.getElementById(`s-card-${id}`) as HTMLElement);

describe("every custom value shows", () => {
  it("a 320-key blank account shows every non-secret key, grouped by folder", async () => {
    expect(ALL_KEYS).toHaveLength(320);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let layout: AccountLayout | undefined;
    const values = await loadSettingsValues("tenant_1", async () => ALL_KEYS.map((key) => ({ key, value: null })), (l) => { layout = l; });
    const shown = ALL_KEYS.filter((key) => !SECRETS.includes(key));
    expect(Object.keys(values).sort()).toEqual([...shown].sort());
    expect(Object.values(values).every((v) => v === "")).toBe(true);
    const { steps, protectedSteps } = arrangeSteps(Object.keys(values));
    expect(steps.map((s) => s.id)).toEqual(["biz", "soc", "gbp", "book", "col", "partners", "reviews", "work", "more"]);
    expect(protectedSteps.map((s) => s.id)).toEqual(["res", "com", "typ", "area"]);
    expect([...steps, ...protectedSteps].reduce((n, s) => n + s.keys.length, 0)).toBe(shown.length);
    page(values, layout);
    // The existing rule stays: the brand reader's second spelling of a fact gets no field (shadowedKeys).
    const shadowed = ["business_main_city", "business_main_state_abbreviation"];
    for (const key of shown) expect(document.getElementById(`cv-${key}`), key).toEqual(shadowed.includes(key) ? null : expect.anything());
    for (const key of SECRETS) expect(document.getElementById(`cv-${key}`), key).toBeNull();
    const onSteps = steps.reduce((n, s) => n + s.keys.length, 0) - shadowed.length;
    expect(screen.getByText(`0 of ${onSteps} filled`)).toBeInTheDocument();
    warn.mockRestore();
  });

  it("puts an unknown new key in the catch-all folder and logs its name only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const values = await loadSettingsValues("tenant_1", async () => [
      { key: "business_name", value: "Test Co" },
      { key: "brand_new_value", value: "made-up text" },
    ]);
    expect(values.brand_new_value).toBe("made-up text");
    expect(warn).toHaveBeenCalledWith("Settings layout: unplaced keys=brand_new_value");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("made-up text");
    page(values);
    const more = card("more");
    expect(more.getByRole("heading", { level: 2, name: "More details" })).toBeInTheDocument();
    expect(more.getByLabelText("Brand new value")).toHaveValue("made-up text");
    expect(document.body.textContent).not.toContain("Other values");
    warn.mockRestore();
  });

  it("never sends a secret key's name or value to the browser", async () => {
    const rows = [
      { key: "business_name", value: "Test Co" },
      { key: "0_webhook_url_form", value: "https://hooks.example/abc" },
      { key: "stripe_client_id", value: "cid-made-up" },
      { key: "business_main_bearer", value: "bearer-made-up" },
      { key: "twilio_auth_token", value: "tok-made-up" },
      { key: "zap_sid", value: "sid-made-up" },
      { key: "oauth_refresh", value: "oauth-made-up" },
      { key: "_hidden", value: "hidden-made-up" },
    ];
    const values = await loadSettingsValues("tenant_1", async () => rows);
    expect(Object.keys(values)).toEqual(["business_name"]);
    page(values);
    const html = document.body.innerHTML;
    for (const { key, value } of rows.slice(1)) {
      expect(html).not.toContain(key);
      expect(html).not.toContain(value);
      expect(classifyKey(key), key).toBe("secret");
    }
  });

  it("places numbered keys by pattern, in number order, one sub-group per item", () => {
    expect(placeKey("residentialservice17content")?.folder.id).toBe("res");
    expect(placeKey("bizarea24path")?.folder.id).toBe("area");
    expect(placeKey("servicetype07")?.folder.id).toBe("typ");
    expect(placeKey("12_our_work_after")?.folder.id).toBe("work");
    expect(placeKey("business_hours_holiday_open")?.group.id).toBe("hours");
    expect(placeKey("business_tiktok_url")?.folder.id).toBe("soc");
    const [res] = arrangeKeys(["residentialservice10", "residentialservice2path", "residentialservice2content", "residentialservice2", "residentialservice00content"]);
    expect(res.groups.map((g) => g.title)).toEqual(["Services page", "Residential service 2", "Residential service 10"]);
    expect(res.groups[1].keys).toEqual(["residentialservice2", "residentialservice2path", "residentialservice2content"]);
    const [area] = arrangeKeys(["bizarea3", "bizarea00maincounty", "bizarea00maincity", "bizarea1"]);
    expect(area.groups.map((g) => g.title)).toEqual(["Main city and county", "Service area 1", "Service area 3"]);
    expect(unplacedKeys(["business_name", "zz_new", "residentialservice40"])).toEqual(["zz_new"]);
  });

  it("names every folder with a humanised title and keeps the HighLevel name as data", () => {
    for (const folder of LAYOUT) {
      expect(folder.title, folder.id).not.toMatch(/_|^\d/);
      expect(folder.title).not.toBe("Other values");
    }
  });
});

describe("page text and long values", () => {
  it("shows a page's text as plain text, read-only outside the unlock step", async () => {
    const user = userEvent.setup();
    const send = vi.fn<SaveValues>(async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "saved" as const })) }));
    page({ business_name: "Test Co", residentialservice1: "Mowing", residentialservice1content: "<p onclick=x>Made-up text</p>", stray_pagecontent: "<b>x</b>" }, undefined, { saveValues: send });
    expect(document.querySelector("p[onclick], b")).toBeNull();
    expect(screen.getByLabelText("Residential service 1, page text")).toHaveValue("<p onclick=x>Made-up text</p>");
    expect(screen.getByLabelText("Residential service 1, page text")).toHaveAttribute("readonly");
    expect(card("more").getByLabelText("Stray pagecontent")).toHaveAttribute("readonly");
    await user.click(screen.getByRole("button", { name: "Unlock Residential services to change" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(screen.getByLabelText("Residential service 1, page text")).not.toHaveAttribute("readonly");
  });

  it("lists a value over 2000 characters by name, read-only, without sending it", async () => {
    const long = "x".repeat(2001);
    const read = settingsReadFrom([{ key: "business_name", value: "Test Co" }, { key: "seasonal_offer_text", value: long }]);
    expect(read).toEqual({ values: { business_name: "Test Co" }, longKeys: ["seasonal_offer_text"] });
    let layout: AccountLayout | undefined;
    await loadSettingsValues("tenant_1", async () => [{ key: "business_name", value: "Test Co" }, { key: "seasonal_offer_text", value: long }], (l) => { layout = l; });
    expect(layout?.longKeys).toEqual(["seasonal_offer_text"]);
    page(read.values, layout);
    const field = screen.getByLabelText("Seasonal offer text");
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveValue("");
    expect(screen.getByText("Too long to edit here. Change it in HighLevel")).toBeInTheDocument();
  });
});

describe("the write side", () => {
  it("accepts a shown key and refuses secret ones with the same classifier", () => {
    expect(classifyKey("brand_new_value")).toBe("shown");
    expect(classifyKey("residentialservice1content")).toBe("shown");
    for (const key of ["0_webhook_url_form", "business_main_client_id", "business_main_bearer", "api_token", "business_main_"]) expect(classifyKey(key), key).toBe("secret");
  });

  it("holds new link and image keys to the link rule", () => {
    expect(isLinkKey("partner1_logo")).toBe(true);
    expect(isLinkKey("100_our_work_before")).toBe(true);
    expect(isLinkKey("residentialservice1path")).toBe(false);
    expect(isSafeToWrite("partner1_logo", "javascript:alert(1)")).toBe(false);
    expect(isSafeToWrite("partner1_logo", "https://assets.example/a.png")).toBe(true);
  });
});
