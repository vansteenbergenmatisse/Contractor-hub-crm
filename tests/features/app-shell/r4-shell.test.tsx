// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AppShell, SearchSheet, buildBusiness, useRowGestures, useShell, type RowAction } from "@/features/app-shell";

const business = buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" });
const shell = (page: React.ReactNode) => render(<AppShell business={business} searchRows={[]}>{page}</AppShell>);
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
const key = (init: KeyboardEventInit) => act(() => { fireEvent.keyDown(document.body, init); });

function Row({ action }: { action: RowAction }) {
  const gestures = useRowGestures<HTMLLIElement>({ label: "Maria", actions: [action] });
  return <li {...gestures} data-testid="row" tabIndex={0}>Maria</li>;
}

const openMenu = () => {
  act(() => { fireEvent.contextMenu(screen.getByTestId("row"), { clientX: 40, clientY: 40 }); });
  expect(screen.getByRole("menu")).toBeInTheDocument();
};

const swipe = (el: Element, from: number, to: number) => {
  const at = (x: number) => [{ clientX: x, clientY: 100 }];
  act(() => { fireEvent.touchStart(el, { touches: at(from), changedTouches: at(from) }); });
  act(() => { fireEvent.touchMove(el, { touches: at((from + to) / 2), changedTouches: at((from + to) / 2) }); });
  act(() => { fireEvent.touchMove(el, { touches: at(to), changedTouches: at(to) }); });
  act(() => { fireEvent.touchEnd(el, { touches: [], changedTouches: at(to) }); });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  push.mockClear();
  setWidth(1440);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("R4-5 shortcuts while a row menu is open (design logic 222)", () => {
  it("ignores every shortcut", () => {
    shell(<ul><Row action={{ label: "Call", onAction: vi.fn() }} /></ul>);
    openMenu();
    key({ key: ",", metaKey: true });
    key({ key: "f", metaKey: true });
    key({ key: "/", metaKey: true });
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("Escape closes the menu even when focus is outside it", () => {
    shell(<ul><Row action={{ label: "Call", onAction: vi.fn() }} /></ul>);
    openMenu();
    act(() => { (document.activeElement as HTMLElement | null)?.blur(); });
    key({ key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape closes the menu first, not the sheet behind it", async () => {
    const user = userEvent.setup({ delay: null });
    shell(<ul><Row action={{ label: "Call", onAction: vi.fn() }} /></ul>);
    await user.click(screen.getAllByRole("button", { name: "Send feedback" })[0]);
    await wait(100);
    openMenu();
    key({ key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Send feedback" })).toHaveClass("is-open");
  });
});

describe("R4-6 feedback Send (design sendFb)", () => {
  it("is enabled on an empty note and goes to the thank-you", async () => {
    const user = userEvent.setup({ delay: null });
    shell(<p>page</p>);
    await user.click(screen.getAllByRole("button", { name: "Send feedback" })[0]);
    await wait(100);
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeEnabled();
    await user.click(send);
    expect(screen.getByText(/Sent\. We read every note\./).closest(".fd-part")).not.toHaveClass("is-off");
  });
});

describe("R4-9 row swipe on the left 24px (design logic 129)", () => {
  it("starts there on a phone when no Back is shown", () => {
    setWidth(390);
    const run = vi.fn();
    shell(<ul><Row action={{ label: "Call", onAction: run, swipe: "right" }} /></ul>);
    const row = screen.getByTestId("row");
    row.getBoundingClientRect = () => ({ left: 0, top: 80, width: 390, height: 60, right: 390, bottom: 140, x: 0, y: 80, toJSON: () => ({}) }) as DOMRect;
    swipe(row, 10, 220);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("stays with the edge swipe on a phone when a Back is shown", () => {
    setWidth(390);
    const run = vi.fn();
    shell(<><button type="button" className="fd-tback">Back</button><ul><Row action={{ label: "Call", onAction: run, swipe: "right" }} /></ul></>);
    const back = document.querySelector<HTMLElement>(".fd-tback");
    if (back) back.getClientRects = () => [{ width: 40, height: 40 }] as unknown as DOMRectList;
    const row = screen.getByTestId("row");
    row.getBoundingClientRect = () => ({ left: 0, top: 80, width: 390, height: 60, right: 390, bottom: 140, x: 0, y: 80, toJSON: () => ({}) }) as DOMRect;
    swipe(row, 10, 220);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("a row with no actions (design uxCtx)", () => {
  function EmptyRow() {
    const gestures = useRowGestures<HTMLLIElement>({ label: "Maria", actions: [] });
    return <li {...gestures} data-testid="empty">Maria</li>;
  }

  it("suppresses the browser menu and opens none", () => {
    shell(<ul><EmptyRow /></ul>);
    const notPrevented = fireEvent.contextMenu(screen.getByTestId("empty"), { clientX: 40, clientY: 40 });
    expect(notPrevented).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("R4-12 shell parity", () => {
  it("choosing the current page in the menu closes feedback", async () => {
    const user = userEvent.setup({ delay: null });
    shell(<p>page</p>);
    await user.click(screen.getAllByRole("button", { name: "Send feedback" })[0]);
    await wait(100);
    const current = document.querySelector<HTMLButtonElement>('.fd-side [aria-current="page"]');
    expect(current).not.toBeNull();
    act(() => { current?.click(); });
    expect(document.querySelector(".fd-fb")).not.toHaveClass("is-open");
    expect(push).not.toHaveBeenCalled();
  });

  it("Tab from an element the trap does not list is left to the browser", () => {
    render(<SearchSheet rows={[]} onClose={vi.fn()} onOpen={vi.fn()} viewportWidth={1440} isMac />);
    const dialog = screen.getByRole("dialog", { name: "Search" });
    dialog.querySelectorAll<HTMLElement>("input, button").forEach((el) => { el.getClientRects = () => [{ width: 10, height: 10 }] as unknown as DOMRectList; });
    const results = dialog.querySelector<HTMLElement>(".fx-sres");
    if (results) results.tabIndex = -1;
    act(() => { results?.focus(); });
    const notHandled = fireEvent.keyDown(results as HTMLElement, { key: "Tab" });
    expect(notHandled).toBe(true);
    expect(results).toHaveFocus();
  });

  function Dialogs() {
    const { sendTimer, askReason } = useShell();
    return (
      <>
        <button type="button" onClick={() => sendTimer({ kind: "Quote", name: "Maria", total: "$1,000", doc: { title: "Quote Q-1", name: "Maria", sub: "1 Example Rd", amount: "$1,000", lines: [] }, onDone: vi.fn() })}>open send</button>
        <button type="button" onClick={() => askReason({ name: "Maria", onPick: vi.fn() })}>open reason</button>
      </>
    );
  }

  it.each(["open send", "open reason"])("Cmd-? over %s opens help; Escape closes only the help", async (name) => {
    // A swipe in an earlier test leaves the shared "no click right after a swipe" window open.
    const later = Date.now() + 1000;
    vi.spyOn(Date, "now").mockImplementation(() => later);
    const user = userEvent.setup({ delay: null });
    shell(<Dialogs />);
    await user.click(screen.getByRole("button", { name }));
    await wait(100);
    const count = () => document.querySelectorAll(".fd-dg").length;
    expect(count()).toBe(1);
    key({ key: "/", metaKey: true });
    await wait(10);
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    key({ key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    expect(count()).toBe(1);
  });
});
