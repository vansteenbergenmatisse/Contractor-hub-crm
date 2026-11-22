// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const shell = vi.hoisted(() => ({ business: undefined as { first: string } | undefined }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/app-shell", async (original) => ({
  ...(await original<typeof import("@/features/app-shell")>()),
  useShell: () => ({ business: shell.business, sendTimer: vi.fn(), askReason: vi.fn(), setInboxCount: vi.fn(), setAction: vi.fn(), setPushed: vi.fn(), openSearch: vi.fn(), openFeedback: vi.fn() }),
  PageAction: () => null,
}));

import { GestureLayer } from "@/features/app-shell";
import { CalendarCard, initialState, STOPS, TodayPage, TODOS } from "@/features/today";

const todoRow = (name: string) => Array.from(document.querySelectorAll<HTMLElement>("li.fd-row")).find((li) => li.textContent?.includes(name)) as HTMLElement;

beforeEach(() => {
  shell.business = undefined;
  document.body.innerHTML = "";
});

describe("R4-2: the Today greeting follows the shell's business details", () => {
  it("greets with the shell's first name, then the new one after a Settings change", () => {
    shell.business = { first: "Pat" };
    const view = render(<TodayPage ownerFirst="Pat" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Morning, Pat.");
    shell.business = { first: "Dana" };
    view.rerender(<TodayPage ownerFirst="Pat" />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Morning, Dana.");
  });

  it("gives the plain greeting when Settings blanks the first name", () => {
    shell.business = { first: "" };
    render(<TodayPage ownerFirst="Pat" />);
    const text = screen.getByRole("heading", { level: 1 }).textContent;
    expect(text).toContain("Morning.");
    expect(text).not.toContain("Pat");
  });
});

describe("R4-3: Today rows take no focus; the menu still opens from the row's buttons", () => {
  it("has no tabindex on a row", () => {
    render(<TodayPage ownerFirst="Pat" />);
    expect(todoRow("Tom Becker").hasAttribute("tabindex")).toBe(false);
  });

  it.each([[{ key: "ContextMenu" }], [{ key: "F10", shiftKey: true }]])("opens the menu from a focused row button with %o", (keys) => {
    render(<GestureLayer><TodayPage ownerFirst="Pat" /></GestureLayer>);
    const button = todoRow("Maria Alvarez").querySelector<HTMLButtonElement>("button.fd-act") as HTMLButtonElement;
    button.focus();
    act(() => { fireEvent.keyDown(button, keys); });
    expect(screen.getByRole("menuitem", { name: "Call" })).toHaveFocus();
  });

  it("gives focus back to a row button when the menu closes with Escape", () => {
    render(<GestureLayer><TodayPage ownerFirst="Pat" /></GestureLayer>);
    const row = todoRow("Maria Alvarez");
    const button = row.querySelector<HTMLButtonElement>("button.fd-act") as HTMLButtonElement;
    button.focus();
    act(() => { fireEvent.keyDown(button, { key: "ContextMenu" }); });
    act(() => { fireEvent.keyDown(screen.getByRole("menuitem", { name: "Call" }), { key: "Escape" }); });
    expect(row.contains(document.activeElement)).toBe(true);
  });
});

describe("R4-8: Today Directions is a plain button, as in the design", () => {
  it("renders a button with no link and no address sent anywhere", () => {
    const out = renderToStaticMarkup(<CalendarCard stops={STOPS} state={initialState(TODOS)} />);
    expect(out).not.toContain("maps.google.com");
    expect(out).not.toMatch(/<a [^>]*fd-dir/);
    expect(out).toContain(`<button data-fx-noact="1" type="button" class="fd-link fd-dir" aria-label="Directions to ${STOPS[0].name}"`);
  });
});
