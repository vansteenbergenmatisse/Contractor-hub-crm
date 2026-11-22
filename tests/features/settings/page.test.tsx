import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const usePushed = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", () => ({ usePushed: (v: boolean) => usePushed(v) }));

import { COLOR_KEYS, ESSENTIAL_KEYS, SettingsPage, initialState } from "@/features/settings";

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

  it("marks the current section and shows Connected or Not connected", () => {
    expect(html).toMatch(/aria-current="page"[^>]*>(?:(?!<\/button>).)*Business details/s);
    expect(html).toContain("Connected: Google Calendar");
    expect(html).toContain("Not connected");
    expect(html).toContain("Ask Forge Forward to connect");
    expect(html).toContain("Done when this row says Connected.");
    expect(html).not.toMatch(/>Connect</);
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

  it("shows an error naming the key and flags the field", () => {
    const s = { ...initialState(), err: { key: "main_color", message: "custom_values.main_color needs a color.", section: "colors" as const } };
    const out = renderToStaticMarkup(<SettingsPage initial={s} />);
    expect(out).toContain("custom_values.main_color needs a color.");
    expect(out).toMatch(/id="cv-main_color"[^>]*aria-invalid="true"|aria-invalid="true"[^>]*id="cv-main_color"/);
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
