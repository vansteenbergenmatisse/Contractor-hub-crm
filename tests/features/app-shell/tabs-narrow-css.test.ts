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

const SHRINK = ".fd-app .fx-tcap .fd-tab{min-width:0}";
const CLIP = ".fd-app .fx-tcap .fd-tn{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}";

describe("phone tab bar under 430px", () => {
  it("lets a tab shrink below its label so the labels never run into each other", () => {
    expect(block("(max-width: 429px)")).toContain(SHRINK);
  });

  it("cuts a label that does not fit with an ellipsis on one line", () => {
    expect(block("(max-width: 429px)")).toContain(CLIP);
  });

  it("keeps every tab at least 44px wide", () => {
    expect(block("(max-width: 1023px)")).toContain("grid-template-columns:repeat(5,minmax(44px,auto))");
  });

  it("changes nothing at 430px and wider", () => {
    const outside = css.replace(block("(max-width: 429px)"), "").replace(block("(max-width: 374px)"), "");
    expect(outside).not.toContain(SHRINK);
    expect(outside).not.toContain(CLIP);
  });
});
