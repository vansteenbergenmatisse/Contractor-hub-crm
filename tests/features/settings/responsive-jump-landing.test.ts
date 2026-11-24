import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/features/settings/components/settings-guided.css"), "utf8");
const phone = css.slice(css.indexOf("@media (max-width: 1023px){\n  /* A focused field"), css.indexOf("/* A phone on its side"));

describe("jumping to a step below 1024px", () => {
  it("takes the top offset from the scroller alone, so it is not counted twice", () => {
    expect(phone).toMatch(/\.fd-main:has\(\.sv-app\)\{[^}]*scroll-padding-top:80px/);
    expect(phone).toMatch(/\.fd-main:has\(\.sv-app\) \.sv-app\{--ga-scroll-top:0px\}/);
  });
});
