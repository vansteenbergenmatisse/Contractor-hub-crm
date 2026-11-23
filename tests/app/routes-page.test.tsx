import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RoutesRoute from "../../src/app/(app)/routes/page";
import { MENU_GROUPS, PAGE_PATH, PAGE_TITLE, pageFromPath } from "@/features/app-shell";

describe("the Routes page", () => {
  it("sits in the Overview menu group, right after Calendar", () => {
    expect(MENU_GROUPS.find((group) => group.title === "Overview")?.pages).toEqual(["today", "inbox", "calendar", "routes"]);
  });

  it("has its own path and title", () => {
    expect(PAGE_PATH.routes).toBe("/routes");
    expect(PAGE_TITLE.routes).toBe("Routes");
    expect(pageFromPath("/routes")).toBe("routes");
  });

  it("says it is not available and shows no record", () => {
    const html = renderToStaticMarkup(RoutesRoute());
    expect(html).toContain('<h1 class="fd-pt">Routes</h1>');
    expect(html).toContain('<span class="fd-chip is-plain">Not available yet</span>');
    expect(html).not.toContain("fd-rw");
  });
});

describe("the Communications name", () => {
  it("keeps the /inbox address", () => {
    expect(PAGE_TITLE.inbox).toBe("Communications");
    expect(PAGE_PATH.inbox).toBe("/inbox");
  });
});
