import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { focusEditor, isPhone, returnToRow } from "../../../src/features/automations/hooks/editor-focus";

// A tiny stand-in for the document: records what got focus and what scrolled.
function fakeDoc(ids: string[]) {
  const log: string[] = [];
  const main = { scrollTop: 500 };
  const el = (id: string) => ({
    focus: (o?: { preventScroll?: boolean }) => void log.push(`focus ${id}${o?.preventScroll ? " (no scroll)" : ""}`),
    scrollIntoView: (o?: { block?: string }) => void log.push(`scroll ${id} ${o?.block ?? ""}`.trim()),
  });
  return {
    log,
    main,
    doc: {
      getElementById: (id: string) => (ids.includes(id) ? el(id) : null),
      querySelector: (sel: string) => (sel === ".fd-main" ? main : null),
    },
  };
}

describe("opening the editor", () => {
  it("puts the cursor in the name field and scrolls to the top on a phone", () => {
    const f = fakeDoc(["fd-au-name"]);
    focusEditor(f.doc, true);
    expect(f.main.scrollTop).toBe(0);
    expect(f.log).toEqual(["focus fd-au-name (no scroll)"]);
  });
  it("puts the cursor in the name field on a computer and leaves the page scroll alone", () => {
    const f = fakeDoc(["fd-au-name"]);
    focusEditor(f.doc, false);
    expect(f.main.scrollTop).toBe(500);
    expect(f.log).toEqual(["focus fd-au-name"]);
  });
});

describe("closing the editor", () => {
  it("scrolls the row into view on a phone and puts focus on its Edit button", () => {
    const f = fakeDoc(["fd-au-wf-9", "fd-au-edit-wf-9"]);
    returnToRow(f.doc, "wf-9", true);
    expect(f.log).toEqual(["scroll fd-au-wf-9 center", "focus fd-au-edit-wf-9 (no scroll)"]);
  });
  it("only moves focus on a computer", () => {
    const f = fakeDoc(["fd-au-wf-9", "fd-au-edit-wf-9"]);
    returnToRow(f.doc, "wf-9", false);
    expect(f.log).toEqual(["focus fd-au-edit-wf-9"]);
  });
  it("does nothing for a row that is not there", () => {
    const f = fakeDoc([]);
    returnToRow(f.doc, "wf-404", true);
    expect(f.log).toEqual([]);
  });
});

describe("phone width", () => {
  it("is under 1024px", () => {
    expect(isPhone({ innerWidth: 1023 })).toBe(true);
    expect(isPhone({ innerWidth: 1024 })).toBe(false);
  });
});

describe("the phone action bar", () => {
  it("uses the design's soft action-bar button, not a filled one", () => {
    const src = readFileSync(join(process.cwd(), "src/features/automations/components/AutomationsPage.tsx"), "utf8");
    expect(src).toContain('className="fd-btn fx-accb"');
    expect(src).not.toMatch(/is-fill[^"]*fx-accb|fx-accb[^"]*is-fill/);
  });
  it("steps aside while the editor is open (pushed screen), so only Save is filled", () => {
    const src = readFileSync(join(process.cwd(), "src/features/automations/components/AutomationsPage.tsx"), "utf8");
    expect(src).toMatch(/usePushed\(open\)/);
    expect(src).toMatch(/const open = state\.edit !== null/);
  });
});
