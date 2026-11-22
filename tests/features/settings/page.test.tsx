import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const usePushed = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async () => {
  const { useReducer } = await import("react");
  return {
    usePushed: (v: boolean) => usePushed(v),
    useShell: () => ({}),
    // Outside the shell useKeptReducer is exactly useReducer.
    useKeptReducer: (_key: string, r: never, a: never, i: never) => useReducer(r, a, i),
  };
});

import { COLOR_KEYS, ESSENTIAL_KEYS, MOCK_CUSTOM_VALUES, SettingsPage, initialState, settingsValuesFrom } from "@/features/settings";
import type { ConnectionStatus } from "@/features/settings";

describe("SettingsPage markup", () => {
  const fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  const html = renderToStaticMarkup(<SettingsPage />);

  it("shows the title, five sections and one field per key under its key name", () => {
    expect(html).toContain("Settings</h1>");
    for (const t of ["Business details", "Brand colors", "Connections", "Your choices", "Not available yet"]) {
      expect(html).toContain(t);
    }
    for (const k of [...ESSENTIAL_KEYS, ...COLOR_KEYS]) {
      expect(html).toContain(`custom_values.${k}`);
      expect(html).toContain(`id="cv-${k}"`);
    }
  });

  it("does not render the page wrapper's data-pg and starts on Business details", () => {
    expect(html).not.toContain("data-pg");
    expect(html).toContain('data-sec="biz"');
    expect(html).toContain('data-open="0"');
    expect(html).toContain('data-q="0"');
    usePushed.mockClear();
    renderToStaticMarkup(<SettingsPage />);
    expect(usePushed).toHaveBeenCalledWith(false);
  });

  it("marks the current section and never claims a connection the app cannot read", () => {
    expect(html).toMatch(/aria-current="page"[^>]*>(?:(?!<\/button>).)*Business details/s);
    // No API gives a connection status yet (build prompt section 6), so no row says Connected,
    // no row says Not connected, and the A2P line does not show.
    expect(html).not.toContain("Connected: Google Calendar");
    expect(html).not.toMatch(/>Connected</);
    expect(html).not.toContain("Not connected");
    expect(html).not.toContain("A2P verified. Your texts get delivered.");
    expect((html.match(/class="fd-chip is-plain">(?:(?!<\/span><\/span>).)*<span class="fd-h">Not available yet<\/span><\/span>/gs) ?? []).length).toBe(6);
    // Each row shows its steps and the ask button, as a not-connected row does in the design.
    expect((html.match(/>Ask Forge Forward to connect</g) ?? []).length).toBe(6);
    expect((html.match(/class="fd-rex fd-how"/g) ?? []).length).toBe(6);
    expect(html).toContain("Done when this row says Connected.");
    expect(html).not.toMatch(/>Connect</);
  });

  it("shows Connected and Not connected rows when a status is given", () => {
    const st: ConnectionStatus[] = [
      { state: "connected", a2pVerified: true }, { state: "connected", note: "Connected: Google Calendar" },
      { state: "not-connected" }, { state: "unknown" }, { state: "connected" }, { state: "not-connected" },
    ];
    const out = renderToStaticMarkup(<SettingsPage initialValues={{ business_phone_number: "+1 (555) 010-0000" }} connections={st} />);
    expect(out).toContain("Connected: Google Calendar");
    expect(out).toContain("A2P verified. Your texts get delivered.");
    expect((out.match(/Not connected/g) ?? []).length).toBe(2);
    expect((out.match(/>Ask Forge Forward to connect</g) ?? []).length).toBe(3);
    expect((out.match(/class="fd-rex fd-how is-off"/g) ?? []).length).toBe(3);
  });

  it("leaves out the phone number sentence when there is no number", () => {
    expect(html).toContain('<p class="fd-rsb">Calls and texts to this number land in your Inbox.</p>');
    expect(html).not.toContain(". Calls and texts");
    const withNumber = renderToStaticMarkup(<SettingsPage initialValues={{ business_phone_number: "+1 (555) 010-0000" }} />);
    expect(withNumber).toContain('<span class="fd-h">+1 (555) 010-0000</span>. Calls and texts to this number land in your Inbox.');
  });

  it("after Ask, says the request is noted on this screen only, never that it was received", () => {
    const out = renderToStaticMarkup(<SettingsPage initial={{ ...initialState(), sec: "conn", asked: { 1: true } }} />);
    expect(out).toContain("Noted on this screen. The request is not sent to Forge Forward yet.");
    expect(out).not.toContain("got your request");
    expect((out.match(/>Ask Forge Forward to connect</g) ?? []).length).toBe(5);
  });

  it("has two real switches showing On or Off and three chips with no switch", () => {
    expect((html.match(/role="switch"/g) ?? []).length).toBe(2);
    expect(html).toContain('aria-label="Approve every quote before it goes out"');
    expect(html).toContain('aria-label="Customers pick their own job date"');
    expect((html.match(/Not available yet<\/span><\/div>/g) ?? []).length).toBe(3);
    expect(html).toMatch(/>(On|Off)</);
  });

  it("labels every field and keeps the 44px search input labelled", () => {
    expect(html).toContain('for="fx-st-q"');
    expect(html).toContain('for="cv-main_color"');
  });

  it("opens the phone detail view and the pushed screen when a section is open", () => {
    usePushed.mockClear();
    const open = renderToStaticMarkup(<SettingsPage initial={{ ...initialState(), sec: "colors", open: true }} />);
    expect(open).toContain('data-sec="colors"');
    expect(open).toContain('data-open="1"');
    expect(usePushed).toHaveBeenCalledWith(true);
  });

  it("does not push while a search is active, and hides rows that do not match", () => {
    usePushed.mockClear();
    const q = renderToStaticMarkup(<SettingsPage initial={{ ...initialState(), open: true, q: "county" }} />);
    expect(usePushed).toHaveBeenCalledWith(false);
    expect(q).toContain('data-q="1"');
    expect(q).toContain('id="cv-business_main_county"');
    expect(q).not.toContain('id="cv-business_email"');
    const none = renderToStaticMarkup(<SettingsPage initial={{ ...initialState(), q: "zzzz" }} />);
    expect(none).toContain("No settings match your search.");
  });

  it("shows the error, flags the field and repeats the message at the field", () => {
    const s = { ...initialState(), err: { key: "main_hover_color", message: "Main, pressed needs a color like #2E7D32.", section: "colors" as const } };
    const out = renderToStaticMarkup(<SettingsPage initial={s} />);
    expect(out).toMatch(/class="fd-lerr fd-ste" id="fd-st-err" role="alert">(?:(?!<\/p>).)*Main, pressed needs a color like #2E7D32\./s);
    expect(out).toMatch(/id="cv-main_hover_color"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*id="cv-main_hover_color"/);
    expect(out).toMatch(/aria-describedby="cv-main_hover_color-err"/);
    expect(out).toMatch(/<p class="fd-lerr" id="cv-main_hover_color-err">(?:(?!<\/p>).)*Main, pressed needs a color like #2E7D32\./s);
    expect((out.match(/class="fd-lerr"/g) ?? []).length).toBe(1);
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
      expect(out).toContain(`custom_values.${k}`);
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

  it("says Save stays on this screen", () => {
    expect(html).toContain("Saved on this screen. It is not written to HighLevel yet.");
    expect(html).not.toContain("Every page uses the new values.");
  });

  it("keeps the color toggle's aria-expanded equal to what shows, also while searching", () => {
    const closed = renderToStaticMarkup(<SettingsPage initial={{ ...initialState(), cols: false, q: "main" }} />);
    expect(closed).toMatch(/aria-expanded="false"[^>]*aria-controls="fd-st-col"/);
    expect(closed).toContain('class="fd-cvg is-off" id="fd-st-col"');
    const open = renderToStaticMarkup(<SettingsPage initial={{ ...initialState(), cols: true, q: "main" }} />);
    expect(open).toMatch(/aria-expanded="true"[^>]*aria-controls="fd-st-col"/);
    expect(open).toContain('class="fd-cvg" id="fd-st-col"');
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
