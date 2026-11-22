import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pipeline",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

// A stand-in for the shell: the page needs useShell and PageAction, nothing else.
vi.mock("@/features/app-shell", async (original) => ({
  ...(await original<typeof import("@/features/app-shell")>()),
  useShell: () => ({ sendTimer: vi.fn(), askReason: vi.fn() }),
  PageAction: () => null,
}));

import { GROUPS, MOCK_CARDS, MOCK_HIDDEN_COUNTS, PipelinePage, STAGES, searchRows } from "@/features/pipeline";

const html = renderToStaticMarkup(<PipelinePage />);

describe("PipelinePage markup", () => {
  it("renders the page content without the shell's outer wrapper", () => {
    expect(html.startsWith('<div class="fd-kb is-g0 is-st0">')).toBe(true);
    expect(html).not.toContain("data-pg=");
    expect(html).toContain('<h1 class="fd-pt">Pipeline</h1>');
  });

  it("draws one card per sample customer from one component", () => {
    expect((html.match(/<article /g) ?? []).length).toBe(MOCK_CARDS.length);
    expect(html).toContain('aria-label="Maria Alvarez"');
  });

  it("draws the 11 stage headers, the stage list, and four group tabs", () => {
    expect((html.match(/<header class="fd-kh /g) ?? []).length).toBe(11);
    expect((html.match(/class="fd-sti/g) ?? []).length).toBe(11);
    expect((html.match(/class="fd-sgb/g) ?? []).length).toBe(4);
    for (const label of ["Sales", "Delivery", "Money", "Later"]) expect(html).toContain(`<span class="fd-sgn">${label}</span>`);
  });

  it("shows the counts, including the cards not drawn", () => {
    expect(html).toContain(`${MOCK_HIDDEN_COUNTS[9]} more in Check Back Later`);
    expect(html).toContain(`${MOCK_HIDDEN_COUNTS[10]} more in Lost`);
    // Every group's count: the cards drawn in its stages plus the cards not drawn.
    for (const g of GROUPS) {
      let total = 0;
      for (let k = g.first; k <= g.last; k++) total += MOCK_CARDS.filter((c) => c.stage === k).length + MOCK_HIDDEN_COUNTS[k];
      expect(html).toContain(`<span class="fd-sgc">${total}</span>`);
    }
    expect(STAGES).toHaveLength(MOCK_HIDDEN_COUNTS.length);
  });

  it("shows the design's literal counts (read from the design page at first load)", () => {
    const groups = [...html.matchAll(/<span class="fd-sgc">(\d+)<\/span>/g)].map((m) => Number(m[1]));
    expect(groups).toEqual([20, 8, 3, 49]);
    const stages = [...html.matchAll(/<span class="fd-kcn[^"]*">(\d+)<\/span><span class="fd-stn">/g)].map((m) => Number(m[1]));
    expect(stages).toEqual([3, 6, 4, 2, 5, 2, 6, 0, 3, 42, 7]);
    expect(html).toContain("37 more in Check Back Later");
    expect(html).toContain("3 more in Lost");
  });

  it("has no trash icon on Payment Due and Lost cards", () => {
    const card = (name: string) => html.slice(html.indexOf(`aria-label="${name}"`), html.indexOf("</article>", html.indexOf(`aria-label="${name}"`)));
    expect(card("Bright Daycare")).not.toContain("fd-klost");
    expect(card("Dale Price")).not.toContain("fd-klost");
    expect(card("Maria Alvarez")).toContain("fd-klost");
  });

  it("draws the calendar button on every card as the design does: hidden and out of reach where it does not apply", () => {
    const card = (name: string) => html.slice(html.indexOf(`aria-label="${name}"`), html.indexOf("</article>", html.indexOf(`aria-label="${name}"`)));
    for (const c of MOCK_CARDS) expect(card(c.name)).toContain("fd-ibtn fd-kcal");
    // Derek Olsen (Quote to Send): the hidden button comes first, so the CSS pushes the trash button right.
    expect(card("Derek Olsen")).toMatch(/<button type="button" class="fd-ibtn fd-kcal is-off" aria-label="Open Derek Olsen in the calendar" tabindex="-1" aria-hidden="true">.*<button type="button" class="fd-ibtn fd-klost"/);
    // Tom Becker (Estimate Booked) has a working calendar button.
    expect(card("Tom Becker")).toMatch(/<button type="button" class="fd-ibtn fd-kcal" aria-label="Open Tom Becker in the calendar">/);
  });

  it("gives every card before Job Done a Job done button", () => {
    const card = (name: string) => html.slice(html.indexOf(`aria-label="${name}"`), html.indexOf("</article>", html.indexOf(`aria-label="${name}"`)));
    expect(card("Maria Alvarez")).toContain(">Job done</button>");
    expect(card("Harlan Realty")).toContain(">Job done</button>");
  });

  it("shows the amount on every card that has one, and none on a card without", () => {
    const card = (name: string) => html.slice(html.indexOf(`aria-label="${name}"`), html.indexOf("</article>", html.indexOf(`aria-label="${name}"`)));
    for (const c of MOCK_CARDS) {
      if (c.amount) expect(card(c.name)).toContain(`<p class="fd-km"><b>${c.amount}</b>`);
      else expect(card(c.name)).not.toContain("<b>");
    }
    expect(card("Derek Olsen")).toContain("<b>$18,400</b>");
  });

  it("marks every card with the id of its search row, so a link can find it", () => {
    for (const row of searchRows) expect(html).toContain(`data-row-id="${row.id}"`);
  });

  it("starts with no move marker", () => {
    expect(html).toContain('class="fd-kstub is-off"');
  });

  it("describes what happens next and does not send anything", () => {
    expect(html).toContain("Follow-up texts today");
  });
});

describe("no component talks to the network", () => {
  const root = join(process.cwd(), "src", "features", "pipeline");
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name)) files.push(p);
    }
  };
  walk(root);

  it("finds the feature's files", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it.each(files.map((f) => [f.slice(root.length + 1), f]))("%s has no fetch, XHR, database or CRM call", (_name, file) => {
    const src = readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    expect(src).not.toMatch(/getPrisma|@\/features\/highlevel/);
  });
});

describe("one component per file", () => {
  const dir = join(process.cwd(), "src", "features", "pipeline", "components");
  it("has a file for each stage column part and no StageColumn file that holds three", () => {
    const names = readdirSync(dir);
    for (const f of ["StageHeader.tsx", "StageEmpty.tsx", "StageMore.tsx"]) expect(names).toContain(f);
    expect(names).not.toContain("StageColumn.tsx");
    for (const f of names.filter((n) => n.endsWith(".tsx"))) {
      const exported = readFileSync(join(dir, f), "utf8").match(/^export function \w+/gm) ?? [];
      expect(exported, f).toHaveLength(1);
    }
  });
});

describe("search rows", () => {
  it("has one pipeline row per card that opens /pipeline", () => {
    expect(searchRows).toHaveLength(MOCK_CARDS.length);
    for (const row of searchRows) {
      expect(row.page).toBe("pipeline");
      expect(row.href).toBe("/pipeline");
    }
    expect(new Set(searchRows.map((r) => r.id)).size).toBe(searchRows.length);
    expect(searchRows[0]).toMatchObject({ name: "Maria Alvarez", sub: "Roof leak repair · New Lead" });
  });
});
