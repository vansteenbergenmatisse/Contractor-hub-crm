// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    usePushed: () => {},
    useShell: () => ({ updateBusiness: vi.fn(), signOut: vi.fn() }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { SettingsPage, type SaveValues } from "@/features/settings";
import { hexToHsv, hsvToHex, nudgeHsv } from "../../../src/features/settings/api/color";

afterEach(cleanup);

// Made-up values only.
const page = (values: Record<string, string>, extra: Partial<React.ComponentProps<typeof SettingsPage>> = {}) =>
  render(<PageStateProvider><SettingsPage initialValues={values} initialSection="colors" {...extra} /></PageStateProvider>);
const trigger = (name: RegExp) => screen.getByRole("button", { name });
const field = (name: RegExp) => screen.getByLabelText(name) as HTMLInputElement;
const square = () => screen.getByRole("slider", { name: "Saturation and brightness" });

describe("color math", () => {
  it("goes from hex to the pad and back without changing the color", () => {
    for (const hex of ["#000000", "#FFFFFF", "#2E7D32", "#0F2740", "#F5A524", "#B3261E", "#808080", "#010203", "#FEFDFC"]) {
      expect(hsvToHex(hexToHsv(hex)), hex).toBe(hex);
    }
  });

  it("keeps the hue when a key press reaches black or white", () => {
    const start = { h: 200, s: 50, v: 1 };
    const dark = nudgeHsv(start, "ArrowDown", false);
    expect(dark).toEqual({ h: 200, s: 50, v: 0 });
    expect(nudgeHsv(dark, "ArrowDown", false)).toEqual(dark);
  });

  it("moves by 1, or by 10 with Shift, and stops at the edges", () => {
    const start = { h: 10, s: 95, v: 50 };
    expect(nudgeHsv(start, "ArrowRight", false).s).toBe(96);
    expect(nudgeHsv(start, "ArrowRight", true).s).toBe(100);
    expect(nudgeHsv(start, "ArrowLeft", true).s).toBe(85);
    expect(nudgeHsv(start, "ArrowUp", true).v).toBe(60);
    expect(nudgeHsv(start, "Tab", false)).toBe(start);
  });
});

describe("the color pad", () => {
  it("opens in a labelled dialog with a square, a hue slider and a hex field", async () => {
    page({ main_color: "#112233" });
    await userEvent.setup().click(trigger(/^Pick Main color/));
    expect(screen.getByRole("dialog", { name: "Pick Main color" })).toBeInTheDocument();
    expect(square()).toHaveFocus();
    expect(screen.getByRole("slider", { name: "Hue" })).toBeInTheDocument();
    expect(field(/^Hex color/).value).toBe("#112233");
  });

  it("changes the field with the arrow keys", async () => {
    page({ main_color: "#808080" });
    await userEvent.setup().click(trigger(/^Pick Main color/));
    fireEvent.keyDown(square(), { key: "ArrowUp", shiftKey: true });
    expect(field(/^Main color/).value).toBe(field(/^Hex color/).value);
    expect(field(/^Main color/).value).not.toBe("#808080");
  });

  it("changes the field with the mouse or a finger", async () => {
    page({ main_color: "#808080" });
    await userEvent.setup().click(trigger(/^Pick Main color/));
    const box = square();
    vi.spyOn(box, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(box, { clientX: 100, clientY: 0, pointerId: 1 });
    expect(field(/^Main color/).value).toBe("#FF0000");
    fireEvent.pointerMove(box, { clientX: 0, clientY: 100, pointerId: 1 });
    expect(field(/^Main color/).value).toBe("#000000");
    fireEvent.pointerUp(box, { pointerId: 1 });
    fireEvent.pointerMove(box, { clientX: 100, clientY: 0, pointerId: 1 });
    expect(field(/^Main color/).value).toBe("#000000");
  });

  it("changes the field with the hue slider", async () => {
    page({ main_color: "#FF0000" });
    await userEvent.setup().click(trigger(/^Pick Main color/));
    fireEvent.change(screen.getByRole("slider", { name: "Hue" }), { target: { value: "120" } });
    expect(field(/^Main color/).value).toBe("#00FF00");
  });

  it("takes a typed hex and ignores an unfinished one", async () => {
    page({ main_color: "#112233" });
    await userEvent.setup().click(trigger(/^Pick Main color/));
    fireEvent.change(field(/^Hex color/), { target: { value: "#44" } });
    expect(field(/^Main color/).value).toBe("#112233");
    expect(field(/^Hex color/)).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(field(/^Hex color/), { target: { value: "445566" } });
    expect(field(/^Main color/).value).toBe("#445566");
    expect(field(/^Hex color/)).not.toHaveAttribute("aria-invalid");
  });

  it("closes on Escape and gives focus back", async () => {
    page({ main_color: "#112233" });
    const user = userEvent.setup();
    await user.click(trigger(/^Pick Main color/));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger(/^Pick Main color/)).toHaveFocus();
  });

  it("closes on an outside press and with Done", async () => {
    page({ main_color: "#112233" });
    const user = userEvent.setup();
    await user.click(trigger(/^Pick Main color/));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(trigger(/^Pick Main color/));
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger(/^Pick Main color/)).toHaveFocus();
  });

  it("keeps Tab inside the pad", async () => {
    page({ main_color: "#112233" });
    const user = userEvent.setup();
    await user.click(trigger(/^Pick Main color/));
    screen.getByRole("button", { name: "Done" }).focus();
    await user.tab();
    expect(square()).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Done" })).toHaveFocus();
  });

  it("does not rewrite a 3-digit or invalid stored value by opening, closing or an edge key", async () => {
    const send = vi.fn<SaveValues>(async () => ({ kind: "results", results: [] }));
    page({ business_name: "Test Co", sub_color: "#000", text_color: "nope" }, { saveValues: send });
    const user = userEvent.setup();
    await user.click(trigger(/^Pick Second color/));
    expect(field(/^Hex color/).value).toBe("#000000");
    fireEvent.keyDown(square(), { key: "ArrowDown" });
    await user.keyboard("{Escape}");
    expect(field(/^Second color/).value).toBe("#000");
    await user.click(trigger(/^Pick Text,? ?$|^Pick Text$/));
    await user.keyboard("{Escape}");
    expect(field(/^Text$/).value).toBe("nope");
    expect(screen.queryByText("You have changes that are not saved yet.")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save to your account" }));
    expect(send).not.toHaveBeenCalled();
  });

  it("a picked color still meets the contrast rule on Save", async () => {
    page({ business_name: "Test Co", main_color: "#112233", text_on_main_color: "#FFFFFF" });
    const user = userEvent.setup();
    await user.click(trigger(/^Pick Main color/));
    fireEvent.change(field(/^Hex color/), { target: { value: "#EEEEEE" } });
    await user.click(screen.getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Apply for this visit" }));
    expect(screen.getByText("The text on your main color is hard to read. Make Main color darker.")).toBeInTheDocument();
  });

  it("cannot be opened in View as client", () => {
    page({ main_color: "#112233" }, { readOnly: true });
    expect(trigger(/^Pick Main color/)).toBeDisabled();
  });
});
