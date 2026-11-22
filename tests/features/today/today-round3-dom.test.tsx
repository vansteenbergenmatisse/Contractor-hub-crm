// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sendTimer } = vi.hoisted(() => ({ sendTimer: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/app-shell", async (original) => ({
  ...(await original<typeof import("@/features/app-shell")>()),
  useShell: () => ({ sendTimer, askReason: vi.fn(), setInboxCount: vi.fn(), setAction: vi.fn(), setPushed: vi.fn(), openSearch: vi.fn(), openFeedback: vi.fn() }),
  PageAction: () => null,
}));

import { GestureLayer, type SendTimerRequest } from "@/features/app-shell";
import { MoneyCards } from "@/features/today";
import { SAMPLE_MONEY } from "../../../src/features/today/mock";
import { SampleToday } from "./sample-today";

const todoRow = (name: string) => Array.from(document.querySelectorAll<HTMLElement>("li.fd-row")).find((li) => li.textContent?.includes(name)) as HTMLElement;

beforeEach(() => {
  sendTimer.mockClear();
});

describe("Today: Money owed renders the same on the server and in the browser", () => {
  it("leaves the due days out of the server HTML and hydrates without a mismatch, then shows them", async () => {
    const server = renderToString(<MoneyCards data={SAMPLE_MONEY} />);
    expect(server).toContain("Paul Ortega");
    expect(server).not.toMatch(/days late|Due /);
    const container = document.createElement("div");
    container.innerHTML = server;
    document.body.appendChild(container);
    const errors = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await act(async () => {
      hydrateRoot(container, <MoneyCards data={SAMPLE_MONEY} />, { onRecoverableError: errors });
    });
    expect(errors).not.toHaveBeenCalled();
    expect(spy.mock.calls.flat().join(" ")).not.toMatch(/hydrat/i);
    spy.mockRestore();
    expect(container.textContent).toMatch(/14 days late/);
    expect(container.textContent).toMatch(/Due /);
    container.remove();
  });
});

describe("Today: Approve opens the send timer with the quote's own document", () => {
  it("shows the three quote lines and marks the row done only when the timer ends", async () => {
    const user = userEvent.setup();
    render(<SampleToday ownerFirst="Pat" />);
    await user.click(within(todoRow("Derek Olsen")).getByRole("button", { name: "Approve" }));
    expect(sendTimer).toHaveBeenCalledOnce();
    const req = sendTimer.mock.calls[0][0] as SendTimerRequest;
    expect(req.kind).toBe("Quote");
    expect(req.doc.lines.map((l) => l[0])).toEqual(["Tear off the old shingles", "Architectural shingles, 28 squares", "Flashing and vents"]);
    expect(todoRow("Derek Olsen")).not.toHaveClass("is-done");
    act(() => req.onDone());
    expect(todoRow("Derek Olsen")).toHaveClass("is-done");
  });

  it("Yes, send invoice opens the timer with the invoice line", async () => {
    const user = userEvent.setup();
    render(<SampleToday ownerFirst="Pat" />);
    await user.click(within(todoRow("Whitmore Dental")).getByRole("button", { name: /Yes, send invoice/ }));
    const req = sendTimer.mock.calls[0][0] as SendTimerRequest;
    expect(req.kind).toBe("Invoice");
    expect(req.doc.lines).toEqual([["Flat roof patch", "$2,350"]]);
    expect(todoRow("Whitmore Dental")).not.toHaveClass("is-done");
  });
});

describe("Today: row gestures on Needs you", () => {
  const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    setWidth(1024);
  });
  const touch = (el: Element, type: "touchStart" | "touchMove" | "touchEnd", x: number) => {
    const list = [{ clientX: x, clientY: 120 }];
    act(() => {
      fireEvent[type](el, type === "touchEnd" ? { touches: [], changedTouches: list } : { touches: list, changedTouches: list });
    });
  };

  it("the menu lists the row's buttons; a done row offers Undo", async () => {
    render(<GestureLayer><SampleToday ownerFirst="Pat" /></GestureLayer>);
    const tom = todoRow("Tom Becker");
    expect(tom).not.toHaveAttribute("tabindex");
    fireEvent.contextMenu(tom, { clientX: 100, clientY: 120 });
    expect(screen.getByRole("menu", { name: "Actions for Tom Becker" })).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["No-show", "Visit done"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Visit done" }));
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(todoRow("Tom Becker")).toHaveClass("is-done");
    fireEvent.contextMenu(todoRow("Tom Becker"), { clientX: 100, clientY: 120 });
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Undo"]);
  });

  it("the menu key opens the menu from the keyboard", () => {
    render(<GestureLayer><SampleToday ownerFirst="Pat" /></GestureLayer>);
    fireEvent.keyDown(todoRow("Maria Alvarez"), { key: "ContextMenu" });
    expect(screen.getByRole("menuitem", { name: "Call" })).toHaveFocus();
  });

  it("a full swipe right presses the row's button", () => {
    setWidth(390);
    render(<GestureLayer><SampleToday ownerFirst="Pat" /></GestureLayer>);
    const maria = todoRow("Maria Alvarez");
    maria.getBoundingClientRect = () => ({ left: 0, top: 100, width: 390, height: 60, right: 390, bottom: 160, x: 0, y: 100, toJSON: () => ({}) }) as DOMRect;
    touch(maria, "touchStart", 60);
    touch(maria, "touchMove", 160);
    touch(maria, "touchMove", 260);
    touch(maria, "touchEnd", 260);
    expect(todoRow("Maria Alvarez")).toHaveClass("is-done");
  });
});
