import { describe, expect, it } from "vitest";
import { MENU_GROUPS, PAGE_PATH, PAGE_TITLE, pageFromPath, TAB_PAGES, type PageKey } from "@/features/app-shell";

describe("nav", () => {
  it("maps every path back to its page, with / as Today and nested paths to their parent", () => {
    for (const key of Object.keys(PAGE_PATH) as PageKey[]) expect(pageFromPath(PAGE_PATH[key])).toBe(key);
    expect(pageFromPath("/inbox/abc")).toBe("inbox");
    expect(pageFromPath("/unknown")).toBe("today");
    expect(pageFromPath("/invoicesx")).toBe("today");
  });

  it("lists every page except Settings in the menu groups exactly once, and every page has a title", () => {
    const listed = MENU_GROUPS.flatMap((g) => g.pages);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed, "settings"].sort()).toEqual((Object.keys(PAGE_PATH) as PageKey[]).sort());
    for (const key of Object.keys(PAGE_PATH) as PageKey[]) expect(PAGE_TITLE[key]).toBeTruthy();
  });

  it("has four page tabs", () => {
    expect(TAB_PAGES).toEqual(["today", "leads", "inbox", "calendar"]);
  });
});
