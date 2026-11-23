// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    usePushed: () => {},
    useShell: () => ({ updateBusiness: vi.fn(), signOut: vi.fn() }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { allowedLogoHosts, isAllowedLogoUrl } from "@/features/brand";
import { PageStateProvider } from "@/features/app-shell";
import { COLOR_KEYS, ESSENTIAL_KEYS, SettingsPage, isSettingsKeyAllowed, loadSettingsValues, type SaveValues } from "@/features/settings";
import { FIELD_GROUPS, groupFields } from "../../../src/features/settings/api/field-groups";
import { DEFAULT_IMAGE_HOSTS, imageHostsFrom, pickerHex, previewSrc } from "../../../src/features/settings/api/image-preview";

afterEach(cleanup);

// Made-up values only.
const HOST = "assets.cdn.filesafe.space";
const account = { imageHosts: [HOST] };
const page = (values: Record<string, string>, extra: Partial<React.ComponentProps<typeof SettingsPage>> = {}) =>
  render(<PageStateProvider><SettingsPage initialValues={values} initialSection="biz" account={account} {...extra} /></PageStateProvider>);
const legends = () => [...document.querySelectorAll("legend")].map((l) => l.textContent);
const idsIn = (legend: string) => {
  const set = [...document.querySelectorAll("fieldset")].find((f) => f.querySelector("legend")?.textContent === legend);
  return [...(set?.querySelectorAll("input[type=text]") ?? [])].map((i) => i.id.replace("cv-", ""));
};
const fullAccount = () => Object.fromEntries(FIELD_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, ""])));

describe("the key-to-group map", () => {
  it("has the six groups in order", () => {
    expect(FIELD_GROUPS.map((g) => g.title)).toEqual(["Business", "Location", "Hours", "Images", "Links", "Offers"]);
  });

  it("covers every design key and holds only allowlisted keys, once each", () => {
    const keys = FIELD_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of ESSENTIAL_KEYS) expect(keys, key).toContain(key);
    for (const key of keys) expect(isSettingsKeyAllowed(key), key).toBe(true);
    for (const key of COLOR_KEYS) expect(keys, key).not.toContain(key);
  });

  it("marks no field required: which are required is not decided", () => {
    for (const f of FIELD_GROUPS.flatMap((g) => g.fields)) expect(f.required, f.key).toBeUndefined();
  });

  it("keeps hours in day order, open before close", () => {
    expect(FIELD_GROUPS[2].fields.map((f) => f.key)).toEqual([
      "business_hours",
      "business_hours_weekdays_open", "business_hours_weekdays_close",
      "business_hours_saturday_open", "business_hours_saturday_close",
      "business_hours_sunday_open", "business_hours_sunday_close",
    ]);
  });

  it("drops empty groups and never loses an allowlisted key the map does not know", () => {
    const out = groupFields(["seasonal_offer_text", "business_name", "not_in_the_map"]);
    expect(out.map((g) => g.title)).toEqual(["Business", "Offers"]);
    expect(out[0].fields.map((f) => f.key)).toEqual(["business_name", "not_in_the_map"]);
  });
});

describe("Business details sections", () => {
  it("renders named groups a screen reader can read, in order", () => {
    page({ ...fullAccount(), business_name: "Test Co" });
    expect(legends()).toEqual(["Business", "Location", "Hours", "Images", "Links", "Offers"]);
    expect(idsIn("Business")).toEqual(["business_name", "business_owner_name", "business_phone_number", "business_email", "business_main_keyword", "universal_cta"]);
    expect(idsIn("Offers")).toEqual(["referral_reward_text", "seasonal_offer_text"]);
  });

  it("shows each link's folder, and Not filled in yet only while it is empty", () => {
    page({ ...fullAccount(), business_name: "Test Co", google_review_request_url: "https://review.example/x" });
    const empty = screen.getByLabelText(/^Bbb review request url/);
    expect(empty).toHaveAccessibleDescription(expect.stringContaining("Not filled in yet"));
    expect(empty).toHaveAccessibleDescription(expect.stringContaining("01b_Google_Business_Profile"));
    const filled = screen.getByLabelText(/^Google review request url/);
    expect(filled).not.toHaveAccessibleDescription(expect.stringContaining("Not filled in yet"));
    expect(screen.getByLabelText(/^Request a job booking link/)).toHaveAccessibleDescription(expect.stringContaining("01c_booking_links"));
  });

  it("labels logo and favicon SVG", () => {
    page({ ...fullAccount(), business_name: "Test Co" });
    expect(screen.getByLabelText(/^Logo/)).toHaveAccessibleDescription(expect.stringContaining("SVG"));
    expect(screen.getByLabelText(/^Favicon/)).toHaveAccessibleDescription(expect.stringContaining("SVG"));
  });
});

describe("keys that come and go", () => {
  it("hides a key the account no longer has, a color too", () => {
    page({ business_name: "Test Co", main_color: "#112233" });
    expect(document.getElementById("cv-business_email")).toBeNull();
    expect(document.getElementById("cv-sub_color")).toBeNull();
    expect(document.getElementById("cv-main_color")).not.toBeNull();
    expect(screen.queryByText("Text")).toBeNull();
  });

  it("keeps every field when the read failed, so nothing looks deleted", () => {
    render(<PageStateProvider><SettingsPage initialValues={{}} initialSection="biz" account={account} /></PageStateProvider>);
    expect(document.getElementById("cv-business_email")).not.toBeNull();
  });

  it("shows no list of keys that have no field", () => {
    page({ business_name: "Test Co" });
    expect(screen.queryByRole("group", { name: "Other values" })).toBeNull();
    expect(screen.queryByText(/^Show \d+ names?$/)).toBeNull();
  });

  it("the server sends neither the name nor the value of an unknown key", async () => {
    const rows = [
      { key: "business_name", value: "Test Co" },
      { key: "new_client_field", value: "PRIVATE-VALUE" },
      { key: "0_webhook_url_form", value: "https://hooks.example/abc" },
      { key: "stripe_secret", value: "sec-456" },
      { key: "_google_maps_embed_src", value: "<iframe>" },
      { key: "bad key!", value: "x" },
    ];
    let layout: unknown;
    const values = await loadSettingsValues("tenant_1", async () => rows, (l) => { layout = l; });
    expect(values).toEqual({ business_name: "Test Co" });
    expect(layout).toEqual({ imageHosts: expect.any(Array) });
    const sent = JSON.stringify({ values, layout });
    for (const bad of ["new_client_field", "PRIVATE-VALUE", "webhook", "hooks.example", "stripe_secret", "sec-456", "embed", "iframe"]) expect(sent).not.toContain(bad);
  });

  it("gives no layout when the read fails", async () => {
    const onLayout = vi.fn();
    expect(await loadSettingsValues("tenant_1", async () => { throw new Error("down"); }, onLayout)).toEqual({});
    expect(onLayout).not.toHaveBeenCalled();
  });

  it("still refuses to save a key that is not allowlisted", () => {
    expect(isSettingsKeyAllowed("new_client_field")).toBe(false);
    expect(isSettingsKeyAllowed("0_webhook_url_form")).toBe(false);
  });
});

describe("color picker", () => {
  const picker = (name: RegExp) => screen.getByRole("button", { name });
  const hex = () => screen.getByLabelText(/^Hex color/) as HTMLInputElement;

  it("picker to text, and text to picker", async () => {
    page({ business_name: "Test Co", main_color: "#112233" }, { initialSection: "colors" });
    const user = userEvent.setup();
    const text = screen.getByLabelText(/^Main color/) as HTMLInputElement;
    await user.click(picker(/^Pick Main color/));
    expect(hex().value).toBe("#112233");
    fireEvent.change(hex(), { target: { value: "#445566" } });
    expect(text.value).toBe("#445566");
    await user.keyboard("{Escape}");
    fireEvent.change(text, { target: { value: "#778899" } });
    await user.click(picker(/^Pick Main color/));
    expect(hex().value).toBe("#778899");
  });

  it("does not rewrite a 3-digit or invalid stored value until it is edited", async () => {
    const send = vi.fn<SaveValues>(async () => ({ kind: "results", results: [] }));
    page({ business_name: "Test Co", sub_color: "#abc", text_color: "nope" }, { initialSection: "colors", saveValues: send });
    expect(screen.getByLabelText(/^Second color/)).toHaveValue("#abc");
    await userEvent.setup().click(picker(/^Pick Second color/));
    expect(hex().value).toBe("#AABBCC");
    await userEvent.setup().keyboard("{Escape}");
    expect(screen.getByLabelText(/^Second color/)).toHaveValue("#abc");
    expect(screen.getByLabelText(/^Text$/)).toHaveValue("nope");
    expect(screen.queryByText("You have changes that are not saved yet.")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Save to your account" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("a picked color still meets the contrast rule on Save", async () => {
    page({ business_name: "Test Co", main_color: "#112233", text_on_main_color: "#FFFFFF" }, { initialSection: "colors" });
    const user = userEvent.setup();
    await user.click(picker(/^Pick Main color/));
    fireEvent.change(hex(), { target: { value: "#eeeeee" } });
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Apply for this visit" }));
    expect(screen.getByText("The text on your main color is hard to read. Make Main color darker.")).toBeInTheDocument();
  });

  it("is disabled in View as client", () => {
    page({ business_name: "Test Co", main_color: "#112233" }, { initialSection: "colors", readOnly: true });
    expect(picker(/^Pick Main color/)).toBeDisabled();
  });

  it("puts no value attribute in the server markup, so no made-up color shows", () => {
    const out = renderToStaticMarkup(<SettingsPage initialValues={{}} />);
    expect(out).toContain('aria-label="Pick Main color"');
    expect(out).not.toContain('type="color"');
    expect(out).not.toMatch(/class="fd-swt"[^>]*value=/);
  });

  it("reads only real hex colors", () => {
    expect(pickerHex("#ABC")).toBe("#aabbcc");
    expect(pickerHex(" #A1B2C3 ")).toBe("#a1b2c3");
    for (const bad of ["", "red", "#12", "#12345", "#gggggg"]) expect(pickerHex(bad)).toBeNull();
  });
});

describe("image previews", () => {
  const good = `https://${HOST}/logo.svg`;

  it("uses the same host rule as the brand feature", () => {
    expect(DEFAULT_IMAGE_HOSTS).toEqual(allowedLogoHosts(""));
    expect(imageHostsFrom(" A.example ,bad host,b.example")).toEqual(allowedLogoHosts(" A.example ,bad host,b.example"));
    for (const url of [good, `http://${HOST}/a.png`, `https://evil.example/a.png`, `https://u:p@${HOST}/a.png`, `https://${HOST}:8443/a.png`, "javascript:alert(1)", "nope"]) {
      expect(previewSrc(url, [HOST]) !== null, url).toBe(isAllowedLogoUrl(url, [HOST]));
    }
  });

  it("previews a background only when its path is an image file", () => {
    expect(previewSrc(`https://${HOST}/bg.webp`, [HOST], true)).toBe(`https://${HOST}/bg.webp`);
    expect(previewSrc(`https://${HOST}/bg.mp4`, [HOST], true)).toBeNull();
  });

  it("shows nothing until the image has loaded, and nothing when it fails", async () => {
    const made: { onload: null | (() => void); onerror: null | (() => void); src: string; referrerPolicy: string }[] = [];
    vi.stubGlobal("Image", class { onload = null; onerror = null; src = ""; referrerPolicy = ""; constructor() { made.push(this); } });
    page({ ...fullAccount(), business_name: "Test Co", business_logo: good, business_favicon_url: "https://evil.example/f.png" });
    expect(made.map((i) => i.src)).toEqual([good]);
    expect(made[0].referrerPolicy).toBe("no-referrer");
    expect(screen.queryByRole("img", { name: /preview/ })).toBeNull();
    expect(document.querySelector("img")).toBeNull();
    made[0].onload?.();
    expect(await screen.findByRole("img", { name: /^Logo.*preview/ })).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /preview/ })).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
