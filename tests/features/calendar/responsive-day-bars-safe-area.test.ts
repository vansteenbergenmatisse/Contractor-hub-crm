import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const dayShell = ".fd-app:has([data-pg=today],[data-pg=calendar],[data-pg=routes])";

describe("day page bars on a landscape phone", () => {
  it("keeps the top bar text clear of the notch and in line with the page", () => {
    expect(css).toContain(
      `${dayShell} .fd-mtop{padding-left:calc(16px + env(safe-area-inset-left,0px));padding-right:calc(16px + env(safe-area-inset-right,0px))}`,
    );
  });

  it("keeps the tab capsule inside the safe area", () => {
    expect(css).toContain(
      `${dayShell} .fx-tcap{left:max(12px,env(safe-area-inset-left,0px));right:max(12px,env(safe-area-inset-right,0px))}`,
    );
  });

  it("keeps the 8px capsule margin on the smallest screens", () => {
    expect(css).toContain(
      `@media (max-width: 359px) and (orientation: landscape){\n  ${dayShell} .fx-tcap{left:max(8px,env(safe-area-inset-left,0px));right:max(8px,env(safe-area-inset-right,0px))}\n}`,
    );
  });
});
