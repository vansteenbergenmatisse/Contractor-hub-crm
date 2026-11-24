// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    useShell: () => ({ updateBusiness: vi.fn(), signOut: vi.fn() }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { SettingsPage } from "@/features/settings";

// Made-up values only.
const VALUES: Record<string, string> = {
  business_name: "Test Co",
  business_phone_number: "111",
  business_city: "Testville",
  brand_primary_color: "#112233",
};

type Call = { id: string; options?: FocusOptions };
let focusCalls: Call[] = [];
let scrollCalls: { id: string; options?: ScrollIntoViewOptions }[] = [];

function stubMedia(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function spy() {
  focusCalls = [];
  scrollCalls = [];
  const realFocus = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
    focusCalls.push({ id: this.id || this.className, options });
    realFocus.call(this, options);
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: function (this: HTMLElement, options?: ScrollIntoViewOptions) { scrollCalls.push({ id: this.id, options }); },
  });
}

const page = () => render(<PageStateProvider><SettingsPage initialValues={VALUES} /></PageStateProvider>);
const stepButton = (scope: HTMLElement, title: string) =>
  within(scope).getAllByRole("button").find((b) => b.classList.contains("ga-step") && b.textContent?.includes(title))!;

// iOS Safari does not focus a button on tap, so the sheet's opener is whatever had focus before:
// after one jump, that is the last step's heading. Taps here use click() alone to copy that.
function jumpFromSheet(title: string) {
  fireEvent.click(screen.getByRole("button", { name: /Jump to a step/ }));
  const dialog = screen.getByRole("dialog", { name: "Jump to a step" });
  focusCalls = [];
  scrollCalls = [];
  fireEvent.click(stepButton(dialog, title));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Jump to a step, every time", () => {
  it("never scrolls back to the opener when the sheet closes, on any jump", () => {
    stubMedia(false);
    spy();
    page();
    // Changed 2026-11-24: Location and hours is now a sub-group of Business, so the jumps alternate the two steps left.
    for (const [title, id] of [["Brand colors", "col"], ["Business", "biz"], ["Brand colors", "col"], ["Business", "biz"]] as const) {
      jumpFromSheet(title);
      expect(screen.queryByRole("dialog", { name: "Jump to a step" })).toBeNull();
      // Every focus move during the close must leave the scroll alone.
      for (const call of focusCalls) expect(call.options, `focus on ${call.id}`).toEqual(expect.objectContaining({ preventScroll: true }));
      expect(document.activeElement?.id).toBe(`s-t-${id}`);
      expect(scrollCalls).toEqual([{ id: `s-card-${id}`, options: { behavior: "smooth", block: "start" } }]);
    }
  });

  it("jumps instantly under reduced motion, every time", () => {
    stubMedia(true);
    spy();
    page();
    for (const [title, id] of [["Brand colors", "col"], ["Business", "biz"]] as const) {
      jumpFromSheet(title);
      for (const call of focusCalls) expect(call.options).toEqual(expect.objectContaining({ preventScroll: true }));
      expect(document.activeElement?.id).toBe(`s-t-${id}`);
      expect(scrollCalls).toEqual([{ id: `s-card-${id}`, options: { behavior: "auto", block: "start" } }]);
    }
  });

  it("lands each pick from the desktop rail without a scroll from focus", () => {
    stubMedia(false);
    spy();
    page();
    const rail = screen.getByRole("complementary", { name: "Steps" });
    // Changed 2026-11-24: Location and hours is now a sub-group of Business.
    for (const [title, id] of [["Brand colors", "col"], ["Business", "biz"], ["Brand colors", "col"]] as const) {
      focusCalls = [];
      scrollCalls = [];
      fireEvent.click(stepButton(rail, title));
      for (const call of focusCalls) expect(call.options).toEqual(expect.objectContaining({ preventScroll: true }));
      expect(document.activeElement?.id).toBe(`s-t-${id}`);
      expect(scrollCalls).toEqual([{ id: `s-card-${id}`, options: { behavior: "smooth", block: "start" } }]);
    }
  });
});
