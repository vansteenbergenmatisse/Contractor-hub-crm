// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ColorPad } from "../../../src/features/settings/components/ColorPad";
import { scrollBehavior } from "../../../src/features/settings/api/scroll-behavior";

const css = readFileSync(join(process.cwd(), "src/features/settings/components/settings-guided.css"), "utf8");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("settings on touch screens", () => {
  it("gives the small controls a 44px target on every touch layout", () => {
    const touch = css.slice(css.indexOf("@media (max-width: 1023px), (pointer: coarse)"));
    expect(touch).toMatch(/\.sv-sg\{min-height:44px/);
    expect(touch).toMatch(/\.ga-handoff summary\{[^}]*padding-block:12px/);
    expect(css).toMatch(/\.ga-x\{[^}]*width:44px;height:44px/);
  });

  it("keeps the phone bars above the tab bar and inside the safe area", () => {
    expect(css).toMatch(/\.ga-acc,\.ga-sbar\{[^}]*bottom:calc\(84px \+ env\(safe-area-inset-bottom,0px\)\)/);
    expect(css).toMatch(/\.ga-acc,\.ga-sbar\{[^}]*left:max\(12px,env\(safe-area-inset-left,0px\)\)/);
    expect(css).toMatch(/\.ga-acc,\.ga-sbar\{[^}]*right:max\(12px,env\(safe-area-inset-right,0px\)\)/);
  });

  it("scrolls a focused field clear of the top bar and the phone bars", () => {
    expect(css).toMatch(/\.fd-main:has\(\.sv-app\)\{[^}]*scroll-padding-top:80px/);
    expect(css).toMatch(/\.fd-main:has\(\.sv-app\)\{[^}]*scroll-padding-bottom:calc\(166px \+ env\(safe-area-inset-bottom,0px\)\)/);
  });

  it("keeps the sheet's close button in reach while the list scrolls", () => {
    expect(css).toMatch(/\.ga-shh\{[^}]*position:sticky/);
  });

  it("stops the motion when the system asks for less", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.sv-app \*[^{]*\{[^}]*transition:none/);
    expect(reduced).toMatch(/\.ga-rail/);
  });
});

describe("scrollBehavior", () => {
  it("is smooth by default and instant under reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));
    expect(scrollBehavior()).toBe("smooth");
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
    expect(scrollBehavior()).toBe("auto");
  });
});

describe("the color pad on a small or keyboard-covered screen", () => {
  it("stays inside the visible area above the keyboard and can scroll", () => {
    vi.stubGlobal("visualViewport", Object.assign(new EventTarget(), { height: 300, offsetTop: 0 }));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const box = this.classList.contains("fd-pad") ? { top: 0, left: 0, width: 272, height: 320 } : { top: 500, left: 20, width: 44, height: 44 };
      return { ...box, bottom: box.top + box.height, right: box.left + box.width, x: box.left, y: box.top, toJSON: () => box } as DOMRect;
    });
    const anchor = createRef<HTMLButtonElement>();
    render(<button ref={anchor} type="button">swatch</button>);
    render(<ColorPad anchor={anchor} host={document.body} label="Pick color" startHex="#112233" onPick={() => {}} onClose={() => {}} />);
    const pad = screen.getByRole("dialog");
    expect(pad.style.top).toBe("8px");
    expect(pad.style.maxHeight).toBe("284px");
  });
});
