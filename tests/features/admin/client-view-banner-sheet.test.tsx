// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientViewBanner } from "../../../src/features/admin/components/ClientViewBanner";

// Bug 2026-11-24: in View client at about 520px wide, the read-only banner (sticky, on top of
// everything) covered the top of the More bottom sheet. The banner sits inside the scrolling main area
// under the top bar, so what matters is where its bottom edge is on screen, which moves with scrolling.
// The banner publishes that edge, and the phone sheet's height stays below it.
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty(VAR);
});

const VAR = "--fd-view-banner-bottom";
const rect = (bottom: number) => ({ bottom }) as DOMRect;

describe("ClientViewBanner publishes where its bottom edge is", () => {
  it("sets the variable to its bottom edge while shown and removes it when gone", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(135.2));
    const { unmount } = render(<ClientViewBanner name="Test Co" />);
    expect(document.documentElement.style.getPropertyValue(VAR)).toBe("136px");
    unmount();
    expect(document.documentElement.style.getPropertyValue(VAR)).toBe("");
  });

  it("measures again when the window changes size (the banner wraps on a narrow screen)", () => {
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(130));
    render(<ClientViewBanner name="Test Co" />);
    spy.mockReturnValue(rect(170));
    window.dispatchEvent(new Event("resize"));
    expect(document.documentElement.style.getPropertyValue(VAR)).toBe("170px");
  });

  it("measures again when any area scrolls (the banner sticks to the top of the main area)", () => {
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(135));
    render(<main id="scroller"><ClientViewBanner name="Test Co" /></main>);
    spy.mockReturnValue(rect(61));
    document.getElementById("scroller")!.dispatchEvent(new Event("scroll"));
    expect(document.documentElement.style.getPropertyValue(VAR)).toBe("61px");
  });

  it("never publishes a negative edge", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect(-20));
    render(<ClientViewBanner name="Test Co" />);
    expect(document.documentElement.style.getPropertyValue(VAR)).toBe("0px");
  });
});

describe("the phone More sheet stays below the banner", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const start = css.indexOf("/* More: the other pages in a bottom sheet");
  // From the sheet's comment to its handle rule (`::before`): the sheet's own rules.
  const block = start < 0 ? "" : css.slice(start, css.indexOf(".fd-side::before", start));

  it("caps the sheet below the banner's edge, with a dvh line for phones whose toolbar shows", () => {
    expect(block).toContain(
      ".fd-app .fd-side{max-height:min(88vh,calc(100vh - var(--fd-view-banner-bottom,0px) - 12px));max-height:min(88vh,calc(100dvh - var(--fd-view-banner-bottom,0px) - 12px))}",
    );
  });
});
