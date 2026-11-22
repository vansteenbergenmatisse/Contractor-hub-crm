// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { BrandLogo, safeHttpsUrl } from "@/shared/ui/brand-logo";

// Images "load" as soon as a src is set, so the logo shows when the link is drawable.
class LoadingImage {
  onload: (() => void) | null = null;
  set src(_v: string) {
    queueMicrotask(() => this.onload?.());
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("safeHttpsUrl", () => {
  it("keeps only https links, as URL.href", () => {
    expect(safeHttpsUrl("https://assets.example.test/l.svg")).toBe("https://assets.example.test/l.svg");
    expect(safeHttpsUrl("  https://assets.example.test/a b.png ")).toBe("https://assets.example.test/a%20b.png");
    expect(safeHttpsUrl('https://assets.example.test/x.png")')).toBe("https://assets.example.test/x.png%22)");
    for (const bad of ["http://assets.example.test/l.svg", "javascript:alert(1)", "data:image/png;base64,AA", "not a url", "", null, undefined]) {
      expect(safeHttpsUrl(bad)).toBeNull();
    }
  });
});

describe("BrandLogo", () => {
  it("draws the initials, then the https logo once it loads, never raw text in url()", async () => {
    vi.stubGlobal("Image", LoadingImage);
    const setProp = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");
    const { container } = render(<BrandLogo url={'https://assets.example.test/x.png")'} initials="SR" />);
    const tile = container.querySelector(".fd-logo") as HTMLElement;
    expect(tile.querySelector(".fd-h")).toHaveTextContent("SR");
    await act(async () => {});
    expect(tile).toHaveClass("has-img");
    // React writes the style even where the test DOM's CSS parser gives up, so read what was asked for.
    const asked = vi.mocked(setProp).mock.calls.map(([, v]) => String(v)).join(" ");
    expect(asked).toContain('url("https://assets.example.test/x.png%22)")');
    expect(asked).not.toContain('x.png")"');
  });

  it("never draws a link that is not https", async () => {
    vi.stubGlobal("Image", LoadingImage);
    const { container } = render(<BrandLogo url="http://assets.example.test/l.svg" initials="SR" />);
    await act(async () => {});
    const tile = container.querySelector(".fd-logo") as HTMLElement;
    expect(tile).not.toHaveClass("has-img");
    expect(tile.style.backgroundImage).toBe("");
  });

  it("with hideWhenEmpty draws nothing when there is neither a logo nor initials", () => {
    expect(render(<BrandLogo url={null} initials="" hideWhenEmpty />).container.innerHTML).toBe("");
    expect(render(<BrandLogo url={null} initials="" />).container.querySelector(".fd-logo")).not.toBeNull();
  });
});
