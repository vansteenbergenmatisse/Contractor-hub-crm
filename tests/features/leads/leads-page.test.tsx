import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

// Shell context stub: the action bar renders inline so the test can see it.
vi.mock("@/features/app-shell", async (orig) => {
  const real = await orig<typeof import("@/features/app-shell")>();
  return { ...real, PageAction: ({ children }: { children: React.ReactNode }) => <div data-action="">{children}</div>, usePushed: () => {} };
});

import { LeadsPage, searchRows } from "@/features/leads";

const html = renderToStaticMarkup(<LeadsPage />);

describe("LeadsPage markup", () => {
  it("renders content only, without the view wrapper", () => {
    expect(html).not.toContain("data-pg");
    expect(html).not.toContain("fd-view");
    expect(html).toContain('<h1 class="fd-pt">Leads</h1>');
  });

  it("shows the three tiles with the waiting count", () => {
    expect(html).toMatch(/<p class="fd-smv">4<\/p><p class="fd-sml">New today/);
    expect(html).toMatch(/<p class="fd-smv">13<\/p><p class="fd-sml">This week/);
    expect(html).toMatch(/<p class="fd-smv">3<\/p><p class="fd-sml">Wait on you/);
  });

  it("shows the filter with counts, All on, and a summary for the longest wait", () => {
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/aria-checked="true" tabindex="0"><span class="fd-wsl">All<\/span> <span class="fd-wsn">8<\/span>/);
    expect(html).toContain("1–24 Hrs");
    expect(html).toContain("3 leads wait on you.");
    expect(html).toContain("Ellen waits longest: 2 days.");
    expect(html).toContain("Call Ellen");
  });

  it("renders all 8 leads, one filled button on the first waiting lead, Reply for the text", () => {
    expect((html.match(/class="fd-rw"/g) ?? []).length).toBe(8);
    expect((html.match(/fd-btn is-fill/g) ?? []).length).toBe(1);
    expect(html).toMatch(/is-fill"[^>]*aria-label="Call Maria Alvarez"/);
    expect(html).toContain('aria-label="Reply to Jordan Reyes"');
    expect(html).not.toContain('aria-label="Call Jordan Reyes"');
  });

  it("colors the wait chip by minutes", () => {
    expect(html).toContain("fd-chip is-warn");
    expect(html).toContain("fd-chip is-bad");
    expect(html).toContain("fd-chip is-hot");
    expect(html).toContain("Call back · waiting 14 min");
    expect(html).toContain("Call back · waiting 2 days");
    expect(html).toContain("Reply · waiting 1 hr");
    expect(html).toContain("Estimate booked");
    expect(html).toContain("Following up");
    expect(html).toContain("Undo booking");
    expect(html).toContain("Book visit");
  });

  it("says Google My Business and draws no brand logo", () => {
    expect(html).toContain("Google My Business");
    expect(html).not.toMatch(/Google (Business|Maps)/);
    expect(html).not.toContain("<img");
  });

  it("shows the source panel with the week total and the service area from the business facts", () => {
    expect(html).toContain("Where your leads come from");
    expect(html).toContain("The 13 leads of this week. Service area: Columbus, OH.");
    expect(html).toContain("Added by you");
    expect(html).toContain("--w:100%");
  });

  it("keeps the Add a lead sheet closed, with an empty form and no visible errors", () => {
    expect(html).not.toContain("is-sheet");
    expect(html).not.toContain("fx-addscrim is-on");
    expect(html).toContain("Add a lead by hand");
    expect(html).toContain('for="fd-ld-name">Name</label>');
    expect(html).toContain('for="fd-ld-addr">Full address (if you have it)</label>');
    expect((html.match(/class="fd-lerr is-off"/g) ?? []).length).toBe(3);
    expect(html).not.toContain("fd-lin is-bad");
  });

  it("puts the Add a lead action in the page action bar", () => {
    expect(html).toMatch(/data-action=""><button[^>]*fx-accb[^>]*>.*Add a lead<\/button>/);
  });

  it("offers the 42 old leads and the automatic switch, with nothing sent", () => {
    expect(html).toContain("42 leads with no contact in 3 months");
    expect(html).toContain("Text them a check-in");
    expect(html).not.toContain("Send to 42 people");
    expect(html).toContain("Make it automatic");
    expect(html).toContain("Or let it run by itself, so nobody goes cold again.");
  });

  it("starts with no empty state", () => {
    expect(html).not.toContain("Nobody waits this long.");
  });
});

describe("searchRows", () => {
  it("exports typed rows that open /leads", () => {
    expect(searchRows.length).toBeGreaterThan(0);
    expect(searchRows.every((r) => r.page === "leads" && r.href === "/leads")).toBe(true);
  });
});

// Phase 2 rule: the app holds no automation and calls nothing.
describe("no network, no automation", () => {
  const root = join(process.cwd(), "src/features/leads");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(root);

  it("never calls fetch, a timer, XHR or a database client", () => {
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) {
      const code = readFileSync(f, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(code, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|setInterval|setTimeout|getPrisma|highlevel|leadconnector/i);
    }
  });
});
