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
