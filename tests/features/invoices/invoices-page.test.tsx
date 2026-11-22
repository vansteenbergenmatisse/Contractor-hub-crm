import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/invoices",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const calls = { pushed: [] as boolean[] };
const current = vi.hoisted(() => ({ business: null as unknown }));
vi.mock("@/features/app-shell", async () => {
  const actual = await vi.importActual<typeof import("@/features/app-shell")>("@/features/app-shell");
  return {
    ...actual,
    useShell: () => ({ setAction: vi.fn(), setPushed: vi.fn(), sendTimer: vi.fn(), askReason: vi.fn(), openSearch: vi.fn(), openFeedback: vi.fn(), setInboxCount: vi.fn() }),
    usePushed: (p: boolean) => { calls.pushed.push(p); },
    useBusiness: () => current.business as import("@/features/app-shell").Business,
    useBusinessValues: () => actual.businessValues(current.business as import("@/features/app-shell").Business),
    PageAction: ({ children }: { children: ReactNode }) => <div data-action>{children}</div>,
  };
});

import { buildBusiness } from "@/features/app-shell";
import { InvoicesPage } from "@/features/invoices";

// Made-up business.
const made = () => buildBusiness({
  name: "Test Roofing Co", phone: "+1 (555) 010-0000", email: "office@test-roofing.example", address: "1 Test Way, Testville",
  hours: "Mon - Fri: 8 - 5", websiteUrl: "https://www.test-roofing.example",
});
current.business = made();
const html = renderToStaticMarkup(<InvoicesPage />);

describe("InvoicesPage markup", () => {
  it("has no fd-view wrapper (the shell owns it)", () => {
    expect(html).not.toContain('class="fd-view');
    expect(html).not.toContain("data-pg");
  });
  it("renders the title, the three tiles and the four filters", () => {
    expect(html).toContain(">Invoices</h1>");
    expect(html).toContain("To send");
    expect(html).toContain("Owed to you");
    expect(html).toContain("Paid this month");
    expect(html).toContain('aria-label="Which rows show"');
    expect((html.match(/class="fd-flb( is-on)?"/g) ?? []).length).toBe(4);
    expect(html).toContain('aria-pressed="true"');
  });
  it("renders all eight rows with numbers and amounts", () => {
    expect((html.match(/class="fd-rw[ "]/g) ?? []).length).toBe(8);
    for (const no of [1049, 1048, 1047, 1046, 1045, 1044, 1042, 1041]) expect(html).toContain(`Invoice ${no}`);
    expect(html).toContain("$1,200");
    expect(html).toContain("No price yet");
    expect(html).toContain("No name yet");
  });
  it("shows only the one missing field on each draft", () => {
    expect(html).toContain("Needs the price");
    expect(html).toContain("Needs the address");
    expect(html).toContain("Needs the name");
    expect(html).toContain(">Price</label>");
    expect(html).toContain(">Billing address</label>");
    expect((html.match(/for="fd-iv-\d+"/g) ?? []).length).toBe(3);
    expect(html).toContain("Make invoice");
  });
  it("has the empty state before the list so the CSS can show it", () => {
    expect(html.indexOf("No invoices in this view.")).toBeGreaterThan(-1);
    expect(html.indexOf("fx-emp")).toBeLessThan(html.indexOf('class="fd-lst"'));
    expect(html).toContain("Show all invoices");
  });
  it("fills the first ready row's Send invoice, as the design does at every width (the sheet's own button shows only on a phone)", () => {
    expect(html).toMatch(/id="fd-iv-r1049"[\s\S]*?class="fd-btn is-fill">Send invoice<\/button>/);
    const list = html.slice(html.indexOf('class="fd-lst"'), html.indexOf('class="fd-side2"'));
    expect((list.match(/class="fd-btn is-fill"/g) ?? []).length).toBe(1);
  });
  it("gives the sheet a focus target and each View button an id to return to", () => {
    expect(html).toContain('id="fd-iv-sheet" tabindex="-1"');
    for (const no of [1049, 1048, 1047, 1046, 1045, 1044, 1042, 1041]) expect(html).toContain(`id="fd-iv-v${no}"`);
  });
  it("marks every row with the id of its search row and every fix error with an id", () => {
    for (const no of [1049, 1048, 1047, 1046, 1045, 1044, 1042, 1041]) expect(html).toContain(`data-row-id="invoice-${no}"`);
    expect((html.match(/id="fd-iv-\d+-e"/g) ?? []).length).toBe(3);
  });
  it("hides Send until ready and Mark paid until sent", () => {
    expect((html.match(/class="fd-btn is-off"/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });
  it("shows the sheet with the business facts, a thank-you and the due term", () => {
    expect(html).toContain('aria-label="The invoice the customer gets"');
    expect(html).toContain("Test Roofing Co");
    expect(html).toContain("1 Test Way, Testville");
    expect(html).toContain("+1 (555) 010-0000 · office@test-roofing.example");
    expect(html).toContain("test-roofing.example · Mon - Fri: 8 - 5");
    expect(html).toContain("Due 7 days after you send it");
    expect(html).toContain("Pay online with the link in this message. Thank you for your business.");
    expect(html).toContain("Back to the list");
  });
  it("shows nothing invented on the sheet when the business has no values", () => {
    current.business = buildBusiness({});
    const empty = renderToStaticMarkup(<InvoicesPage />);
    current.business = made();
    for (const bad of ["Northway", "Mike", "undefined", "null", "Your business", "Test Roofing", "Summit St"]) expect(empty).not.toContain(bad);
    expect(empty).not.toContain("> · <");
    expect(empty).not.toMatch(/fd-dcs"><span class="fd-h"> · /);
    expect(empty).toContain("Pay online with the link in this message.");
    // Neither a logo nor a name: no empty colored tile.
    expect(empty).not.toContain('class="fd-logo');
    // No business values at all: no empty header row (and so no divider) above the title.
    expect(empty).not.toContain('class="fd-dch"');
    expect(html).toContain('class="fd-dch"');
  });
  it("shows the initials tile when the business has a name", () => {
    expect(html).toContain('<span class="fd-logo" aria-hidden="true"><span class="fd-h">TR</span></span>');
  });
  it("puts the sheet's title and status chip on one line: a plain-text chip, as in the design", () => {
    expect(html).toContain('<p class="fd-dcn"><span><span class="fd-h">Invoice 1049</span></span><span class="fd-chip is-plain"><span class="fd-h">Made when the job was marked done</span></span></p>');
  });
  it("marks late invoices light red and over 7 days full red", () => {
    expect(html).toContain("fd-chip is-bad");
    expect(html).toContain("fd-chip is-hot");
    expect(html).toContain("6 days late");
    expect(html).toContain("14 days late");
  });
  it("starts with the list view, not the pushed sheet", () => {
    expect(html).toContain('class="fd-dv"');
    expect(calls.pushed.length).toBeGreaterThan(0);
    expect(calls.pushed.every((p) => p === false)).toBe(true);
  });
  it("promises no reminder or automation", () => {
    expect(html.toLowerCase()).not.toContain("remind");
  });
});

describe("invoices feature sources", () => {
  const root = join(process.cwd(), "src/features/invoices");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  walk(root);
  it("never calls fetch, Prisma or HighLevel and runs no timer of its own", () => {
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\bfetch\s*\(/);
      expect(src, f).not.toMatch(/XMLHttpRequest|getPrisma|@\/shared\/lib\/prisma|leadconnector|setInterval/);
    }
  });
  it("marks the mock module", () => {
    expect(readFileSync(join(root, "mock.ts"), "utf8").startsWith("// MOCK DATA (Phase 2)")).toBe(true);
  });
});
