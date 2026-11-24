// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { keyboardInset } from "../../../src/features/inbox/api/keyboard";
import { useKeyboardInset } from "../../../src/features/inbox/hooks/use-keyboard-inset";

describe("keyboardInset", () => {
  it("is the part of the layout the keyboard covers", () => {
    expect(keyboardInset({ layoutHeight: 800, height: 460, offsetTop: 0, scale: 1 })).toBe(340);
  });
  it("counts a page the browser panned up", () => {
    expect(keyboardInset({ layoutHeight: 800, height: 460, offsetTop: 300, scale: 1 })).toBe(40);
  });
  it("ignores a collapsing browser bar", () => {
    expect(keyboardInset({ layoutHeight: 800, height: 744, offsetTop: 0, scale: 1 })).toBe(0);
  });
  it("ignores pinch zoom", () => {
    expect(keyboardInset({ layoutHeight: 800, height: 400, offsetTop: 0, scale: 2 })).toBe(0);
  });
  it("is never negative", () => {
    expect(keyboardInset({ layoutHeight: 800, height: 900, offsetTop: 0, scale: 1 })).toBe(0);
  });
});

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  useKeyboardInset(ref);
  return <div ref={ref} data-testid="root" />;
}

describe("useKeyboardInset", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("publishes the inset on the element and clears it when the keyboard closes", () => {
    const listeners = new Map<string, () => void>();
    const viewport = {
      height: 460,
      offsetTop: 0,
      scale: 1,
      addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
      removeEventListener: (type: string) => listeners.delete(type),
    };
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerHeight", 800);
    const { getByTestId, unmount } = render(<Probe />);
    const root = getByTestId("root");
    expect(root.style.getPropertyValue("--fd-kb")).toBe("340px");
    expect(root.dataset.kb).toBe("1");

    viewport.height = 800;
    act(() => listeners.get("resize")?.());
    expect(root.style.getPropertyValue("--fd-kb")).toBe("");
    expect(root.dataset.kb).toBeUndefined();

    unmount();
    expect(listeners.size).toBe(0);
  });

  it("does nothing in a browser without visualViewport", () => {
    vi.stubGlobal("visualViewport", undefined);
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("root").dataset.kb).toBeUndefined();
  });
});
