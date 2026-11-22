import { describe, expect, it, vi } from "vitest";
import { createFocusReturn, viewClass } from "@/features/app-shell";

describe("createFocusReturn", () => {
  it("gives focus back to the element that opened the sheet, once", () => {
    const opener = { focus: vi.fn(), isConnected: true };
    const back = createFocusReturn();
    back.remember(opener);
    back.restore();
    back.restore();
    expect(opener.focus).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an element that left the page or for nothing remembered", () => {
    const gone = { focus: vi.fn(), isConnected: false };
    const back = createFocusReturn();
    back.restore();
    back.remember(gone);
    back.restore();
    expect(gone.focus).not.toHaveBeenCalled();
  });

  it("forgets without focusing", () => {
    const opener = { focus: vi.fn(), isConnected: true };
    const back = createFocusReturn();
    back.remember(opener);
    back.forget();
    back.restore();
    expect(opener.focus).not.toHaveBeenCalled();
  });
});

describe("viewClass (the page wrapper)", () => {
  it("animates only on entrance", () => {
    expect(viewClass("today", false, false)).toBe("fd-view is-nav-a");
    expect(viewClass("today", false, true)).toBe("fd-view");
  });
  it("lets the Inbox conversation through (is-thru) while a conversation is open", () => {
    expect(viewClass("inbox", true, true)).toBe("fd-view is-thru");
    expect(viewClass("inbox", false, true)).toBe("fd-view");
    expect(viewClass("quotes", true, true)).toBe("fd-view");
  });
});
