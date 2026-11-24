import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const dayMain = ".fd-main:has([data-pg=today],[data-pg=calendar],[data-pg=routes])";
const value = (selector: string, prop: string) => {
  const start = css.indexOf(`${selector}{`);
  if (start < 0) return null;
  const rule = css.slice(start + selector.length + 1, css.indexOf("}", start));
  return new RegExp(`${prop}:([^;]+)`).exec(rule)?.[1] ?? null;
};

describe("keyboard focus on the day pages clears the fixed bars", () => {
  it("stops a focused row below the sticky top bar", () => {
    expect(value(`.fd-app ${dayMain}`, "scroll-padding-top")).toBe("72px");
  });

  it("stops a focused row above the tab capsule", () => {
    expect(value(`.fd-app ${dayMain}.fx-cap`, "scroll-padding-bottom")).toBe("calc(100px + env(safe-area-inset-bottom,0px))");
  });

  it("stops a focused row above the action bar too", () => {
    expect(value(`.fd-app ${dayMain}.fx-cap.fx-capacc`, "scroll-padding-bottom")).toBe("calc(164px + env(safe-area-inset-bottom,0px))");
  });
});
