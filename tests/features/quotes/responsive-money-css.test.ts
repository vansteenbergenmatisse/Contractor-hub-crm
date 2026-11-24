import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const block = (query: string) => {
  const start = css.indexOf(`@media ${query}{/* money pages */`);
  if (start < 0) return "";
  const end = css.indexOf("/* end money pages */", start);
  return end < 0 ? "" : css.slice(start, end);
};

describe("money pages: a focused field stays clear of the bars", () => {
  it("keeps fields clear of the sticky header, the tab bar and the save bar on touch layouts", () => {
    const rules = block("(max-width: 1023px)");
    expect(rules).toContain(".fd-app .fd-dv .fd-lin,.fd-app .fd-au .fd-lin");
    expect(rules).toMatch(/scroll-margin-top:\d+px/);
    expect(rules).toMatch(/scroll-margin-bottom:calc\(\d+px \+ env\(safe-area-inset-bottom,0px\)\)/);
  });

  it("keeps a long amount inside its tile on the four money pages", () => {
    expect(css).toContain(":is([data-pg=quotes],[data-pg=invoices],[data-pg=payments],[data-pg=automations]) .fd-smv .fd-h{min-width:0;overflow-wrap:anywhere}");
    expect(css).toContain(".fd-app :is([data-pg=quotes],[data-pg=invoices],[data-pg=payments],[data-pg=automations]) .fd-smv{white-space:normal}");
  });

  it("seats the save bar on the screen edge, so no content shows under it", () => {
    const rules = block("(max-width: 1023px)");
    expect(rules).toContain(".fd-app .fd-view .fd-dv.is-doc .fd-docact,.fd-app .fd-view .fd-au.is-edit .fd-auf .fd-pna{bottom:-20px;padding-bottom:calc(32px + env(safe-area-inset-bottom,0px))}");
  });

  it("lets the save bar scroll with the form on a short screen (landscape or keyboard open)", () => {
    const rules = block("(max-width: 1023px) and (max-height: 520px)");
    expect(rules).toContain(".fd-app .fd-view .fd-dv.is-doc .fd-docact");
    expect(rules).toContain(".fd-app .fd-view .fd-au.is-edit .fd-auf .fd-pna");
    expect(rules).toContain("position:static");
  });
});
