import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/features/settings/components/settings-guided.css"), "utf8");
const landscape = css.slice(css.indexOf("@media (max-width: 1023px) and (max-height: 500px)"), css.indexOf("@media (prefers-reduced-motion: reduce)"));

describe("settings on a phone on its side", () => {
  it("moves the page content out from under the notch, on top of the shell's 16px gutter", () => {
    expect(css).toMatch(/\.sv-app\{[^}]*padding-left:max\(0px,calc\(env\(safe-area-inset-left,0px\) - 16px\)\)/);
    expect(css).toMatch(/\.sv-app\{[^}]*padding-right:max\(0px,calc\(env\(safe-area-inset-right,0px\) - 16px\)\)/);
  });

  it("keeps a step focused in the sheet clear of the sticky sheet header", () => {
    expect(css).toMatch(/\.ga-rail\{[^}]*scroll-padding-top:64px/);
  });

  it("reserves the full height of the Jump to a step bar when focus moves", () => {
    expect(landscape).toMatch(/\.fd-main:has\(\.sv-app\)\{scroll-padding-bottom:calc\(142px \+ env\(safe-area-inset-bottom,0px\)\)/);
  });
});
