import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/automations",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AppShell, buildBusiness } from "@/features/app-shell";
import { AutomationsPage } from "@/features/automations";

const business = buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" });
const html = renderToStaticMarkup(<AppShell business={business} searchRows={[]}><AutomationsPage /></AppShell>);
const count = (re: RegExp) => (html.match(re) ?? []).length;

describe("AutomationsPage markup", () => {
  it("renders the title, the tiles and no fd-view wrapper of its own", () => {
    expect(html).toContain('<h1 class="fd-pt">Automations</h1>');
    expect(html).toContain("Running");
    expect(html).toContain("Switched off");
    expect(html).toContain("In total");
    expect(html).toContain('<div class="fd-au">');
    expect(count(/data-pg="/g)).toBe(1);
  });

  it("groups rows under the folder headings", () => {
    for (const f of ["Lead Capture", "Instant Replies", "Follow-Up + Booking", "Reviews", "Campaigns", "AI Agents"]) {
      expect(html).toContain(`<p class="fd-lgh">${f}</p>`);
    }
    expect(html).not.toContain(">Made by you<");
  });

  it("shows When, Does and Stops on all 17 rows, each with a working switch", () => {
    expect(count(/<dt>When<\/dt>/g)).toBe(17);
    expect(count(/<dt>Does<\/dt>/g)).toBe(17);
    expect(count(/<dt>Stops<\/dt>/g)).toBe(17);
    expect(count(/role="switch" aria-checked="true"/g)).toBe(17);
    expect(html).toContain("Ran 13 times this week");
    expect(html).toContain("Ran 1 time this week");
    expect(html).toContain("Waits for your OK");
    expect(html).toContain("You start it");
  });

  it("starts with the editor closed, no error, no test line and no Undo bar", () => {
    expect(html).toContain('class="fd-auf is-off"');
    expect(html).toContain('class="fd-lerr is-off"');
    expect(html).toContain('class="fd-okl fd-tst2 is-off"');
    expect(html).toContain('class="fd-okl is-off"');
    expect(html).not.toContain("fd-au is-edit");
  });

  it("hides the remove question until asked", () => {
    expect(count(/class="fd-rask is-off"/g)).toBe(17);
    expect(count(/Yes, remove/g)).toBe(17);
  });

  it("has the four numbered steps with labels tied to their fields", () => {
    for (const [id, label] of [["fd-au-when", "1. When it starts"], ["fd-au-wait", "2. How soon"], ["fd-au-msg", "3. The text that goes out"], ["fd-au-stop", "4. When it stops"]]) {
      expect(html).toContain(`for="${id}">${label}</label>`);
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("Send me a test");
    expect(html).toContain("Back to the list");
  });

  it("shows the Promotion campaign's offer sentence without raw braces or a placeholder note when no offer is set", () => {
    expect(html).toContain("Texts old leads your seasonal offer.");
    expect(html).not.toContain("{seasonal offer}");
    expect(html).not.toContain("no seasonal offer set");
  });

  it("gives each row's Edit button an id to return focus to", () => {
    expect(html).toContain('id="fd-au-edit-wf-1"');
    expect(count(/id="fd-au-edit-wf-\d+"/g)).toBe(17);
  });

  it("offers New automation at the top and in the panel", () => {
    expect(count(/New automation/g)).toBeGreaterThanOrEqual(2);
  });
});

describe("no network, no engine", () => {
  const root = join(process.cwd(), "src", "features", "automations");
  const files: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(n)) files.push(p);
    }
  };
  walk(root);

  it("never calls fetch, a timer, storage or the database", () => {
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\bfetch\s*\(/);
      expect(src, f).not.toMatch(/setTimeout|setInterval|localStorage|XMLHttpRequest|prisma/i);
    }
  });
});
