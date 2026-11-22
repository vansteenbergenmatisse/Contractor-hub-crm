import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/quotes",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Shell context stub: the page needs useShell, usePushed and the business values.
const current = vi.hoisted(() => ({ values: {} as Record<string, string> }));
vi.mock("@/features/app-shell", () => ({
  useShell: () => ({ sendTimer: vi.fn(), askReason: vi.fn(), setPushed: vi.fn(), setAction: vi.fn() }),
  usePushed: () => {},
  useBusinessValues: () => current.values,
  REASONS: ["Ask again later", "Said no", "Chose a competitor", "Not a fit", "Opted out"],
}));

import { QuoteSheet, QuotesPage, SEED_QUOTES, sheetBusiness } from "@/features/quotes";

// Made-up business values.
const VALUES = {
  business_name: "Test Roofing Co", business_address: "1 Test Way, Testville", business_phone_number: "+1 (555) 010-0000",
  business_email: "office@test-roofing.example", business_hours: "Mon - Fri: 8 - 5", business_website_url: "https://www.test-roofing.example",
};
const NONE = { business_name: "", business_address: "", business_phone_number: "", business_email: "", business_hours: "", business_website_url: "" };
current.values = VALUES;
const html = renderToStaticMarkup(<QuotesPage />);

describe("QuotesPage markup", () => {
  it("renders the title, the tiles and the three filters", () => {
    expect(html).toContain(">Quotes</h1>");
    expect(html).toContain("1 waits for your OK");
    expect(html).toContain("5 out with customers");
    expect(html).toContain("3 of 10");
    for (const f of ["All", "To approve", "Sent"]) expect(html).toContain(`>${f}</button>`);
    expect(html).not.toContain("fd-view");
  });
  it("lists every quote with its status and one filled approve button", () => {
    for (const q of SEED_QUOTES) expect(html).toContain(q.name);
    expect(html).toContain("Needs service and price");
    expect((html.match(/is-fill/g) ?? []).length).toBe(2); // list button and sheet button of the same quote
    expect(html).toContain("Opened 3 times today. Call now.");
  });
  it("shows the build form only for a quote that needs a price, with labels", () => {
    expect((html.match(/Build quote/g) ?? []).length).toBe(1);
    expect(html).toContain('for="fd-qt-sv-q1"');
    expect(html).toContain("Price or price range");
  });
  it("has the empty state right before the list so CSS can show it", () => {
    expect(html).toMatch(/class="fx-emp">.*No quotes in this view\..*<\/div><div class="fd-lst">/);
  });
  it("shows the signed-in business's own facts on the sheet", () => {
    expect(html).toContain(VALUES.business_name);
    expect(html).toContain("+1 (555) 010-0000 · office@test-roofing.example");
    expect(html).toContain("test-roofing.example · Mon - Fri: 8 - 5");
    expect(html).toContain(VALUES.business_address);
  });
  it("shows nothing invented on the sheet when the business has no values", () => {
    current.values = NONE;
    const empty = renderToStaticMarkup(<QuotesPage />);
    current.values = VALUES;
    for (const bad of ["Northway", "Mike", "undefined", "null", "Test Roofing", "Summit St"]) expect(empty).not.toContain(bad);
    expect(empty).not.toContain("> · <");
    expect(empty).not.toMatch(/fd-dcs">\s*·/);
  });
  it("starts on the list, not on the sheet", () => {
    expect(html).toContain('class="fd-dv"');
    expect(html).not.toContain("is-doc");
  });
});

describe("QuoteSheet", () => {
  const base = { business: sheetBusiness(VALUES), onShut() {}, onEdit() {}, onCancel() {}, onSave() {}, onUpload() {}, onRemoveFile() {}, onApprove() {} };
  it("edit mode shows fields, Save and Cancel and hides the sheet", () => {
    const out = renderToStaticMarkup(<QuoteSheet {...base} quote={SEED_QUOTES[0]} editing />);
    expect(out).toContain('id="fd-qe-name"');
    expect(out).toContain('id="fd-qe-a2"');
    expect(out).not.toContain('id="fd-qe-a3"');
    expect(out).toContain(">Save</button>");
    expect(out).not.toContain("Approve and send");
  });
  it("an empty quote explains itself and offers no approve or edit", () => {
    const out = renderToStaticMarkup(<QuoteSheet {...base} quote={SEED_QUOTES[1]} editing={false} />);
    expect(out).toContain("No price yet");
    expect(out).toContain("No lines yet");
    expect(out).toContain("Upload your own quote");
    expect(out).not.toContain(">Edit<");
    expect(out).not.toContain("Approve and send");
  });
  it("an own file shows its name and Remove", () => {
    const out = renderToStaticMarkup(<QuoteSheet {...base} quote={{ ...SEED_QUOTES[1], status: "ready", file: "mine.pdf" }} editing={false} />);
    expect(out).toContain("Your own quote: mine.pdf");
    expect(out).toContain(">Remove</button>");
  });
});

describe("no network, no automation", () => {
  it("the feature never calls fetch, a database or an AI client", () => {
    const root = join(process.cwd(), "src/features/quotes");
    const files: string[] = [];
    const walk = (dir: string) => { for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (/\.tsx?$/.test(e.name)) files.push(join(dir, e.name));
    } };
    walk(root);
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const code = readFileSync(f, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(code, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|@\/shared\/lib\/prisma|setInterval|anthropic|openai/i);
    }
  });
});
