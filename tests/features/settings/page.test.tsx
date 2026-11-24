import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async () => {
  const { useReducer } = await import("react");
  return {
    useShell: () => ({}),
    // Outside the shell useKeptReducer is exactly useReducer.
    useKeptReducer: (_key: string, r: never, a: never, i: never) => useReducer(r, a, i),
  };
});

import { COLOR_KEYS, ESSENTIAL_KEYS, MOCK_CUSTOM_VALUES, SettingsPage, initialState, labelOfKey, settingsValuesFrom } from "@/features/settings";

describe("SettingsPage markup", () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const html = renderToStaticMarkup(<SettingsPage />);

  it("shows the title, the tabs and one field per key, under its plain label only", () => {
    expect(html).toContain("Settings</h1>");
    for (const t of ["Your details", "Brand colors", "Connections", "Your choices", "Not available yet"]) {
      expect(html).toContain(t);
    }
    for (const k of [...ESSENTIAL_KEYS, ...COLOR_KEYS]) {
      expect(html).toContain(`for="cv-${k}">${labelOfKey(k)}</label>`);
      expect(html).toContain(`id="cv-${k}"`);
    }
    expect(html).not.toContain("custom_values.");
  });

  it("does not render the page wrapper's data-pg and starts on Business details", () => {
    expect(html).not.toContain("data-pg");
    expect(html).toContain('data-sec="biz"');
    expect(html).toContain('data-open="0"');
    expect(html).toContain('data-q="0"');
  });

  it("labels every field", () => {
    expect(html).toContain('for="cv-main_color"');
  });

  it("shows the error once, next to its field, and the field points to it", () => {
    const msg = "Main, pressed needs a color like #2E7D32.";
    const s = { ...initialState(), sec: "colors" as const, err: { key: "main_hover_color", message: msg, section: "colors" as const } };
    const out = renderToStaticMarkup(<SettingsPage initial={s} />);
    expect(out).toContain(`<p class="fd-lerr" id="cv-main_hover_color-err" role="alert">${msg}</p>`);
    expect(out).toMatch(/class="fd-lin is-bad" id="cv-main_hover_color"/);
    expect(out).toMatch(/id="cv-main_hover_color"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*id="cv-main_hover_color"/);
    expect(out).toMatch(/aria-describedby="cv-main_hover_color-err"/);
    expect(out.split(msg).length - 1).toBe(1);
    expect(out).toContain('class="fd-lerr fd-ste is-off"');
  });

  it("has the design's Sign out button", () => {
    expect(html).toMatch(/<button type="button" class="sv-btn is-plain sv-out">Sign out<\/button>/);
  });

  it("shows the sub-account's real values, empty fields for keys it lacks, and its extra keys under their own key", () => {
    // Made-up values only.
    const real = {
      business_name: "Test Roofing Co", business_phone_number: "+1 (555) 010-0000", main_color: "#112233",
      business_address_city: "Testville", request_a_job_booking_link: "https://book.test.example/job", business_latitude: "10.5",
    };
    const out = renderToStaticMarkup(<SettingsPage initialValues={real} />);
    expect(out).toContain('value="Test Roofing Co"');
    expect(out).toContain('value="+1 (555) 010-0000"');
    expect(out).toContain('value="#112233"');
    // A key the sub-account lacks is empty, not the sample.
    expect(out).toMatch(/id="cv-business_email"[^>]*value=""/);
    expect(out).toMatch(/id="cv-sub_color"[^>]*value=""/);
    expect(out).not.toContain("#0F2740");
    expect(out).not.toContain("Get A Free Quote");
    // Extra keys: listed under their key, with their value.
    for (const k of ["business_address_city", "request_a_job_booking_link", "business_latitude"]) {
      expect(out).toContain(`for="cv-${k}">${labelOfKey(k)}</label>`);
      expect(out).toContain(`id="cv-${k}"`);
    }
    expect(out).toContain('value="Testville"');
    expect(out).toContain('value="https://book.test.example/job"');
    expect(out).not.toContain("business_google_profile_url");
  });

  it("shows empty fields, never the sample business, when given no values", () => {
    const out = renderToStaticMarkup(<SettingsPage initialValues={{}} />);
    for (const k of [...ESSENTIAL_KEYS, ...COLOR_KEYS]) expect(out).toContain(`id="cv-${k}"`);
    expect((out.match(/value="[^"]+"/g) ?? []).filter((v) => !/^value="(true|false)"/.test(v))).toEqual([]);
    for (const bad of ["Northway", "Mike", "Columbus", "undefined"]) expect(out).not.toContain(bad);
  });

  it("finds an extra key with the search", () => {
    const out = renderToStaticMarkup(<SettingsPage initialValues={{ business_address_city: "Testville", business_email: "a@b.example" }} initial={{ ...initialState({ business_address_city: "Testville", business_email: "a@b.example" }), q: "address_city", open: true }} />);
    expect(out).toContain('id="cv-business_address_city"');
    expect(out).not.toContain('id="cv-business_email"');
  });

  it("never renders a secret or unknown key, whether filtered on the server or passed straight in", () => {
    // Made-up values only.
    const raw = [
      { key: "business_name", value: "Test Co" }, { key: "0_webhook_url_form", value: "https://hooks.example/abc" },
      { key: "some_api_key", value: "key-123" }, { key: "stripe_secret", value: "sec-456" },
      { key: "unknown_tenant_key", value: "zzz-unknown" }, { key: "_google_maps_embed_src", value: "<iframe src=x>" },
    ];
    const outs = [
      renderToStaticMarkup(<SettingsPage initialValues={settingsValuesFrom(raw)} />),
      renderToStaticMarkup(<SettingsPage initialValues={Object.fromEntries(raw.map((r) => [r.key, r.value]))} />),
    ];
    for (const out of outs) {
      expect(out).toContain('value="Test Co"');
      for (const bad of ["0_webhook_url_form", "hooks.example", "some_api_key", "key-123", "stripe_secret", "sec-456", "unknown_tenant_key", "zzz-unknown", "google_maps_embed", "iframe"]) {
        expect(out).not.toContain(bad);
      }
    }
  });

  it("puts a saved color in the swatch style only when it is a hex color, else the color the app uses", () => {
    const out = renderToStaticMarkup(<SettingsPage initialValues={{ main_color: "red;position:fixed;inset:0", sub_color: "#abc", text_color: "#112233" }} />);
    // The field itself still shows what HighLevel holds; only the style attribute must not carry it.
    expect(out).not.toMatch(/style="[^"]*(position|red|inset)/);
    expect(out).toContain('style="background:#abc"');
    expect(out).toContain('style="background:#112233"');
    // Not a hex color, or empty: the swatch shows the color the app applies now (its CSS variable).
    expect(out).toContain('style="background:var(--main-color)"');
    expect(out).toContain('style="background:var(--main-hover-color)"');
    expect(out).toContain('style="background:var(--text-on-main-color)"');
    const swatches = out.match(/class="fd-swt"[^>]*>/g) ?? [];
    expect(swatches).toHaveLength(14);
    expect(swatches.every((t) => /style="background:(#[0-9a-f]{3,6}|var\(--[a-z-]+\))"/i.test(t))).toBe(true);
  });

  it("says what Save really does, in plain words", () => {
    expect(html).toContain("Changes last until you close or reload this page.");
    expect(html).toContain("save each step.");
    expect(html).not.toContain("GoHighLevel");
    expect(html).not.toContain("custom values");
    for (const untrue of ["Every page uses", "A change here changes them too", "Every page takes", "Folder 0", "names of the keys"]) {
      expect(html).not.toContain(untrue);
    }
  });

  it("opens on the section named in the URL", () => {
    const out = renderToStaticMarkup(<SettingsPage initialValues={{ ...MOCK_CUSTOM_VALUES }} initialSection="conn" />);
    expect(out).toContain('data-sec="conn"');
    expect(out).toContain('data-open="1"');
  });

  it("never calls fetch and the feature source has no fetch", () => {
    expect(fetchSpy).not.toHaveBeenCalled();
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    for (const f of walk(join(process.cwd(), "src/features/settings")).filter((p) => /\.tsx?$/.test(p))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|features\/highlevel/);
    }
  });
});
