import { describe, expect, it } from "vitest";
import {
  highlight, nextScope, rowHref, rowParam, searchPlacement, shortcutHint, trapTab, flashStyle, type SearchRow,
} from "@/features/app-shell";

describe("highlight", () => {
  it("splits the name around the first case-blind match of the trimmed term", () => {
    expect(highlight("Maria Alvarez", " alv ")).toEqual(["Maria ", "Alv", "arez"]);
    expect(highlight("Maria Alvarez", "MAR")).toEqual(["", "Mar", "ia Alvarez"]);
  });

  it("is null when the name does not hold the term (a sub-line hit) or the term is blank", () => {
    expect(highlight("Maria Alvarez", "leak")).toBeNull();
    expect(highlight("Maria Alvarez", "  ")).toBeNull();
  });
});

describe("searchPlacement", () => {
  it("is a full-screen sheet below 1024px", () => {
    expect(searchPlacement(390, null)).toEqual({ phone: true });
    expect(searchPlacement(1023, { top: 20, right: 900 })).toEqual({ phone: true });
  });

  it("anchors under the top Search field: width min(600, w-32), right edges aligned, top of the field", () => {
    expect(searchPlacement(1440, { top: 14, right: 1000 })).toEqual({ phone: false, left: 400, top: 14, width: 600 });
  });

  it("clamps to a 16px margin on both sides", () => {
    expect(searchPlacement(1440, { top: 14, right: 300 })).toEqual({ phone: false, left: 16, top: 14, width: 600 });
    expect(searchPlacement(1440, { top: 14, right: 1500 })).toEqual({ phone: false, left: 824, top: 14, width: 600 });
  });

  it("falls back to centred at 72px when the field is not on screen", () => {
    expect(searchPlacement(1200, null)).toEqual({ phone: false, left: 300, top: 72, width: 600 });
    expect(searchPlacement(1024, null)).toEqual({ phone: false, left: 212, top: 72, width: 600 });
  });
});

describe("nextScope (roving arrows on the scope chips)", () => {
  const keys = ["all", "leads", "quotes"] as const;
  it("moves right and left and wraps", () => {
    expect(nextScope(keys, "all", "ArrowRight")).toBe("leads");
    expect(nextScope(keys, "quotes", "ArrowRight")).toBe("all");
    expect(nextScope(keys, "all", "ArrowLeft")).toBe("quotes");
  });
  it("ignores other keys", () => {
    expect(nextScope(keys, "all", "ArrowDown")).toBeNull();
  });
});

describe("trapTab", () => {
  it("wraps from the last to the first and from the first to the last with Shift", () => {
    expect(trapTab(4, 5, false)).toBe(0);
    expect(trapTab(0, 5, true)).toBe(4);
  });
  it("lets the browser move focus inside the dialog", () => {
    expect(trapTab(2, 5, false)).toBeNull();
    expect(trapTab(2, 5, true)).toBeNull();
  });
  it("pulls focus back in when it is outside the dialog", () => {
    expect(trapTab(-1, 5, false)).toBe(0);
    expect(trapTab(-1, 5, true)).toBe(4);
    expect(trapTab(-1, 0, false)).toBeNull();
  });
});

describe("rowHref and rowParam", () => {
  const row = (href: string): SearchRow => ({ id: "lead 7", page: "leads", name: "A", sub: "", href });
  it("adds ?row=<id> to the page link, encoded, and & when the link has a query", () => {
    expect(rowHref(row("/leads"))).toBe("/leads?row=lead%207");
    expect(rowHref(row("/leads?add=1"))).toBe("/leads?add=1&row=lead%207");
  });
  it("reads the row id back from a location search string", () => {
    expect(rowParam("?row=lead%207")).toBe("lead 7");
    expect(rowParam("?add=1&row=x")).toBe("x");
    expect(rowParam("")).toBeNull();
    expect(rowParam("?row=")).toBeNull();
  });
});

describe("shortcutHint", () => {
  it("uses the command sign on a Mac and Ctrl elsewhere", () => {
    expect(shortcutHint(true)).toBe("⌘?");
    expect(shortcutHint(false)).toBe("Ctrl ?");
  });
});

describe("flashStyle", () => {
  it("covers the row's box", () => {
    expect(flashStyle({ left: 1, top: 2, width: 3, height: 4 })).toEqual({ left: "1px", top: "2px", width: "3px", height: "4px" });
  });
});
