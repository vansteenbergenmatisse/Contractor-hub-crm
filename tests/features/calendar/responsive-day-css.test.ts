import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const block = (query: string) => {
  const parts: string[] = [];
  let at = css.indexOf(`@media ${query}{`);
  while (at >= 0) {
    const open = css.indexOf("{", at);
    let depth = 1;
    let i = open + 1;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth += 1;
      if (css[i] === "}") depth -= 1;
      i += 1;
    }
    parts.push(css.slice(open + 1, i - 1));
    at = css.indexOf(`@media ${query}{`, i);
  }
  return parts.join("\n");
};

describe("day pages at phone sizes", () => {
  it("gives notices their padding back from the paragraph reset", () => {
    expect(css).toContain(".fd-app .fd-cal .fd-cdl{margin:0 0 12px;padding:10px 14px}");
  });

  it("keeps the calendar action bar inside the screen", () => {
    expect(block("(max-width: 1023px)")).toContain(".fd-app:has([data-pg=calendar]) .fx-acc,.fd-app:has([data-pg=calendar]) .fx-accg{min-width:0}");
  });

  it("keeps seven 44px day buttons on a 320px phone", () => {
    expect(block("(max-width: 359px)")).toContain(".fd-app [data-pg=calendar] .fd-cal .fd-cdays{margin-inline:-14px;gap:1px}");
  });

  it("moves the calendar actions into the page on a short landscape phone", () => {
    const short = block("(max-width: 1023px) and (max-height: 500px)");
    expect(short).toContain(".fd-app:has([data-pg=calendar]) .fx-acc{display:none}");
    expect(short).toContain(".fd-app [data-pg=calendar] .fd-cal .fd-cnav{display:flex}");
  });

  it("keeps landscape content and sheets clear of the notch", () => {
    const landscape = block("(max-width: 1023px) and (orientation: landscape)");
    expect(landscape).toContain("env(safe-area-inset-left,0px)");
    expect(landscape).toContain("env(safe-area-inset-right,0px)");
  });
});
