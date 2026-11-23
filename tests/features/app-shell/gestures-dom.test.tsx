// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Suspense, use, useEffect, useRef, useState } from "react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/today",
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AppShell, GestureLayer, buildBusiness, useHorizontalSwipe, usePullToRefresh, useRowGestures, useSearchRows, useSheetSwipe, useShell, type RowAction } from "@/features/app-shell";

const business = buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" });

const rect = (left: number, top: number, width: number, height: number) => () =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

const touch = (el: Element, type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) => {
  const list = [{ clientX: x, clientY: y }];
  act(() => {
    fireEvent[type](el, type === "touchEnd" ? { touches: [], changedTouches: list } : { touches: list, changedTouches: list });
  });
};
const drag = (el: Element, from: [number, number], to: [number, number], release = true) => {
  touch(el, "touchStart", ...from);
  touch(el, "touchMove", (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  touch(el, "touchMove", ...to);
  if (release) touch(el, "touchEnd", ...to);
};
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });

function Row({ actions, onOpen }: { actions: RowAction[]; onOpen?: () => void }) {
  const gestures = useRowGestures<HTMLLIElement>({ label: "Maria Alvarez", actions });
  return (
    <li {...gestures} tabIndex={0} data-testid="row" onClick={onOpen}>
      <span>Maria Alvarez</span>
      <button type="button">Call</button>
    </li>
  );
}

const make = () => {
  const call = vi.fn();
  const done = vi.fn();
  const lost = vi.fn();
  const text = vi.fn();
  const actions: RowAction[] = [
    { label: "Lost", onAction: lost, tone: "danger" },
    { label: "Call", onAction: call, swipe: "right" },
    { label: "Text", onAction: text },
    { label: "Mark done", onAction: done, swipe: "left" },
  ];
  return { call, done, lost, text, actions };
};

const renderRow = (actions: RowAction[], onOpen?: () => void, onSay?: (t: string) => void) => {
  render(<GestureLayer onSay={onSay}><ul><Row actions={actions} onOpen={onOpen} /></ul></GestureLayer>);
  const row = screen.getByTestId("row");
  row.getBoundingClientRect = rect(0, 100, 390, 60);
  return row;
};

let clock = 0;
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  // each test starts well after the last one's swallowed click
  clock += 60_000;
  vi.setSystemTime(Date.now() + clock);
  setWidth(390);
  push.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  setWidth(1024);
});

describe("row swipe", () => {
  it("a full swipe right runs the main action and says so; the colour strip shows what lets go", () => {
    const { call, actions } = make();
    const say = vi.fn();
    const row = renderRow(actions, undefined, say);
    drag(row, [100, 120], [240, 124], false);
    const strip = document.querySelector(".fx-swipe");
    expect(strip).toHaveClass("fx-swipe", "is-on", "is-r", "is-go");
    expect(strip).toHaveAttribute("aria-hidden", "true");
    expect(strip?.querySelector(".fx-swl")).toHaveTextContent("Call");
    expect(row.style.transform).toBe("translateX(140px)");
    touch(row, "touchEnd", 240, 124);
    expect(call).toHaveBeenCalledOnce();
    expect(say).toHaveBeenCalledWith("Call. Done.");
    expect(row.style.transform).toBe("");
    expect(document.querySelector(".fx-swipe.is-on")).toBeNull();
  });

  it("the strip shows the action's swipeLabel while the menu keeps its label", () => {
    setWidth(390);
    const reply = vi.fn();
    const say = vi.fn();
    const actions: RowAction[] = [{ label: "Open conversation", swipeLabel: "Reply", onAction: reply, swipe: "right" }];
    const row = renderRow(actions, undefined, say);
    drag(row, [100, 120], [240, 124], false);
    expect(document.querySelector(".fx-swipe .fx-swl")).toHaveTextContent("Reply");
    touch(row, "touchEnd", 240, 124);
    expect(reply).toHaveBeenCalledOnce();
    expect(say).toHaveBeenCalledWith("Reply. Done.");
    setWidth(1280);
    fireEvent.contextMenu(row, { clientX: 200, clientY: 130 });
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Open conversation"]);
  });

  it("a short swipe snaps back and runs nothing", () => {
    const { call, actions } = make();
    const row = renderRow(actions);
    drag(row, [100, 120], [180, 120], false);
    expect(document.querySelector(".fx-swipe")).not.toHaveClass("is-go");
    touch(row, "touchEnd", 180, 120);
    expect(call).not.toHaveBeenCalled();
  });

  it("a swipe left marks it done; a side with no action gives only 28px", () => {
    const { done, actions } = make();
    const row = renderRow(actions);
    drag(row, [300, 120], [150, 120]);
    expect(done).toHaveBeenCalledOnce();

    const only: RowAction[] = [{ label: "Call", onAction: vi.fn(), swipe: "right" }];
    document.body.innerHTML = "";
    const bare = renderRow(only);
    drag(bare, [300, 120], [100, 120], false);
    expect(document.querySelector(".fx-swipe")).toHaveClass("is-l", "is-none");
    expect(bare.style.transform).toBe("translateX(-28px)");
    touch(bare, "touchEnd", 100, 120);
  });

  it("a vertical move is a scroll, not a swipe", () => {
    const { call, actions } = make();
    const row = renderRow(actions);
    drag(row, [100, 120], [200, 300]);
    expect(call).not.toHaveBeenCalled();
    expect(row.style.transform).toBe("");
  });

  it("the click right after a swipe does not also open the row", () => {
    const { actions } = make();
    const open = vi.fn();
    const row = renderRow(actions, open);
    drag(row, [100, 120], [180, 120]);
    fireEvent.click(row);
    expect(open).not.toHaveBeenCalled();
    wait(500);
    fireEvent.click(row);
    expect(open).toHaveBeenCalledOnce();
  });
});

describe("row menu", () => {
  it("right-click opens the menu at the pointer: safe actions first, destructive last after a separator", () => {
    setWidth(1280);
    const { actions } = make();
    const row = renderRow(actions);
    fireEvent.contextMenu(row, { clientX: 200, clientY: 130 });
    const menu = screen.getByRole("menu", { name: "Actions for Maria Alvarez" });
    expect(menu).toHaveClass("fx-menu");
    expect(menu.closest(".fx-mbox")).not.toHaveClass("is-ph");
    expect(document.querySelector(".fx-mscrim")).not.toHaveClass("is-dim");
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Call", "Text", "Mark done", "Lost"]);
    expect(items[3]).toHaveClass("fx-mi", "is-bad");
    expect(menu.querySelector(".fx-msep")).toHaveAttribute("role", "separator");
    expect(menu).toHaveFocus();
    expect(document.getElementById("fx")).toHaveClass("fx-root");
  });

  it("arrow keys move, Home and End jump, Escape closes and focus goes back to the row", () => {
    setWidth(1280);
    const { actions } = make();
    const row = renderRow(actions);
    fireEvent.contextMenu(row, { clientX: 200, clientY: 130 });
    const items = screen.getAllByRole("menuitem");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(items[3]).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(items[3]).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(row).toHaveFocus();
  });

  it("Shift+F10 and the ContextMenu key open it from the keyboard with the first item focused; an item runs once", () => {
    setWidth(1280);
    const { text, actions } = make();
    const row = renderRow(actions);
    row.focus();
    fireEvent.keyDown(row, { key: "F10", shiftKey: true });
    expect(screen.getAllByRole("menuitem")[0]).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    fireEvent.keyDown(screen.getByRole("button", { name: "Call" }), { key: "ContextMenu" });
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
    fireEvent.click(items[1]);
    expect(screen.queryByRole("menu")).toBeNull();
    wait(1);
    expect(text).toHaveBeenCalledOnce();
  });

  it("a long press opens the phone menu with the row lifted above it; moving cancels it", () => {
    const { actions } = make();
    const open = vi.fn();
    const row = renderRow(actions, open);
    touch(row, "touchStart", 100, 120);
    touch(row, "touchMove", 110, 120);
    wait(600);
    expect(screen.queryByRole("menu")).toBeNull();
    touch(row, "touchEnd", 110, 120);

    touch(row, "touchStart", 100, 120);
    wait(499);
    expect(screen.queryByRole("menu")).toBeNull();
    wait(2);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(document.querySelector(".fx-mbox")).toHaveClass("is-ph");
    expect(document.querySelector(".fx-mscrim")).toHaveClass("is-dim");
    const preview = document.querySelector(".fx-pvw");
    expect(preview).toHaveAttribute("aria-hidden", "true");
    expect(preview).toHaveTextContent("Maria Alvarez");
    touch(row, "touchEnd", 100, 120);
    fireEvent.click(row);
    expect(open).not.toHaveBeenCalled();
    // the touch device's own contextmenu right after does not reopen or close it
    fireEvent.contextMenu(row, { clientX: 100, clientY: 120 });
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(document.querySelector(".fx-mscrim")!);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

function Sheet({ onClose, open = true }: { onClose: () => void; open?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useSheetSwipe(ref, onClose, { enabled: open });
  return <div ref={ref} data-testid="sheet">Sheet</div>;
}

describe("sheet swipe down", () => {
  it("closes past 90px, springs back under it, and does nothing on a computer", () => {
    const onClose = vi.fn();
    render(<Sheet onClose={onClose} />);
    const sheet = screen.getByTestId("sheet");
    sheet.getBoundingClientRect = rect(0, 400, 390, 400);
    drag(sheet, [100, 410], [100, 470], false);
    expect(sheet.style.transform).toBe("translateY(60px)");
    touch(sheet, "touchEnd", 100, 470);
    expect(onClose).not.toHaveBeenCalled();
    expect(sheet.style.transform).toBe("");
    drag(sheet, [100, 410], [100, 520]);
    expect(onClose).toHaveBeenCalledOnce();

    setWidth(1280);
    drag(sheet, [100, 410], [100, 520]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("pulling the grabber up gives the sheet more room", () => {
    render(<Sheet onClose={vi.fn()} />);
    const sheet = screen.getByTestId("sheet");
    sheet.getBoundingClientRect = rect(0, 400, 390, 400);
    drag(sheet, [100, 410], [100, 330]);
    expect(sheet.style.height).toBe("92vh");
  });
});

function Strip({ left, right }: { left: () => void; right: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useHorizontalSwipe(ref, { onSwipeLeft: left, onSwipeRight: right });
  return <div ref={ref} data-testid="strip">Mon Tue Wed</div>;
}

describe("stage list and day strip swipe", () => {
  it("runs left or right from 70px sideways, not for a scroll or from the left edge", () => {
    const left = vi.fn();
    const right = vi.fn();
    render(<Strip left={left} right={right} />);
    const strip = screen.getByTestId("strip");
    drag(strip, [300, 100], [220, 105]);
    expect(left).toHaveBeenCalledOnce();
    drag(strip, [100, 100], [180, 100]);
    expect(right).toHaveBeenCalledOnce();
    drag(strip, [300, 100], [200, 160]);
    drag(strip, [20, 100], [200, 100]);
    expect(left).toHaveBeenCalledOnce();
    expect(right).toHaveBeenCalledOnce();
  });
});

// Stays suspended until `release`, which keeps a refresh transition pending like a slow server.
function SlowPage({ slow }: { slow: Promise<void> }) {
  const [hang, setHang] = useState(false);
  useEffect(() => {
    refresh.mockImplementation(() => setHang(true));
    return () => { refresh.mockReset(); };
  }, []);
  if (hang) use(slow);
  return <p data-testid="body">Page body</p>;
}

function PullBox({ onRefresh }: { onRefresh?: () => Promise<boolean> }) {
  const ref = useRef<HTMLDivElement>(null);
  usePullToRefresh(ref, { onRefresh });
  return <div ref={ref} data-testid="pull-box">list</div>;
}

const leadRow = (id: string, name: string) => ({ id, page: "leads" as const, name, sub: "", href: "/leads" });
const SEED = [leadRow("s1", "Seeded Person")];
const OWN = [leadRow("o1", "Handed Person")];
function SeedAndOwn({ own }: { own: boolean }) {
  useSearchRows("leads", SEED, { seed: true });
  return own ? <OwnRows /> : null;
}
function OwnRows() {
  useSearchRows("leads", OWN);
  return null;
}

function Detail() {
  const { askReason } = useShell();
  return (
    <div>
      <button type="button" onClick={() => askReason({ name: "Maria", onPick: vi.fn() })}>Remove</button>
      <p data-testid="body">Page body</p>
    </div>
  );
}

const shell = (page: React.ReactNode) => render(<AppShell business={business} searchRows={[]}>{page}</AppShell>);

describe("shell gestures (phone)", () => {
  it("a swipe from the left edge does nothing without a Back (design); a swipe down closes the open drawer", () => {
    shell(<Detail />);
    const body = screen.getByTestId("body");
    drag(body, [10, 300], [130, 305]);
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    expect(nav).not.toHaveClass("is-open");
    expect(document.querySelector<HTMLElement>("[data-pg]")?.style.transform ?? "").toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(nav).toHaveClass("is-open");
    nav.getBoundingClientRect = rect(0, 0, 300, 800);
    drag(nav, [100, 20], [100, 140]);
    expect(nav).not.toHaveClass("is-open");
  });

  it("a swipe from the left edge presses the page's own Back when it shows one", () => {
    const back = vi.fn();
    shell(<div><button type="button" className="fd-link fd-tback" onClick={back}>Back</button><p data-testid="body">x</p></div>);
    drag(screen.getByTestId("body"), [10, 300], [130, 305]);
    expect(back).toHaveBeenCalledOnce();
    expect(screen.getByRole("navigation", { name: "Main menu" })).not.toHaveClass("is-open");
  });

  it("a swipe down on the reason sheet closes it like Cancel", () => {
    shell(<Detail />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("alertdialog");
    const sheet = dialog.querySelector<HTMLElement>(".fd-cfb")!;
    sheet.getBoundingClientRect = rect(0, 400, 390, 400);
    drag(sheet, [100, 410], [100, 520]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("pull to refresh runs a real refresh and says Refreshed only after it finishes", async () => {
    refresh.mockClear();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    shell(<Detail />);
    const body = screen.getByTestId("body");
    drag(body, [200, 100], [200, 250], false);
    const pull = document.querySelector(".fx-pull");
    expect(pull).toHaveClass("is-on", "is-ready");
    expect(pull).toHaveAttribute("role", "status");
    expect(pull).toHaveTextContent("Release to refresh");
    expect(document.querySelector("[data-pg]")).toHaveStyle({ transform: "translateY(75px)" });
    touch(body, "touchEnd", 200, 250);
    expect(refresh).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(document.querySelector(".fx-pull")).toHaveTextContent("Refreshed");
    wait(900);
    expect(document.querySelector(".fx-pull.is-on")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("pull to refresh claims nothing when the phone is offline", async () => {
    refresh.mockClear();
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    shell(<Detail />);
    const body = screen.getByTestId("body");
    drag(body, [200, 100], [200, 250]);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(refresh).not.toHaveBeenCalled();
    expect(document.querySelector(".fx-pull")).toHaveTextContent("Could not update. Try again.");
    expect(document.querySelector(".fx-pull")).not.toHaveTextContent("Updated");
    online.mockRestore();
  });

  it("pull to refresh gives up after 10 seconds and ignores a late answer", async () => {
    let release: () => void = () => {};
    const slow = new Promise<void>((resolve) => { release = resolve; });
    shell(<Suspense fallback={<p>loading</p>}><SlowPage slow={slow} /></Suspense>);
    const body = screen.getByTestId("body");
    drag(body, [200, 100], [200, 250], false);
    const list = [{ clientX: 200, clientY: 250 }];
    await act(async () => { fireEvent.touchEnd(body, { touches: [], changedTouches: list }); await vi.advanceTimersByTimeAsync(0); });
    expect(refresh).toHaveBeenCalledOnce();
    expect(document.querySelector(".fx-pull")).toHaveTextContent("Updating");
    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
    expect(document.querySelector(".fx-pull")).toHaveTextContent("Updating");
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(document.querySelector(".fx-pull")).toHaveTextContent("Could not update. Try again.");
    await act(async () => { release(); await vi.advanceTimersByTimeAsync(0); });
    expect(document.querySelector(".fx-pull")).not.toHaveTextContent("Updated");
  });

  it("a pull before any refresh says Pull to refresh, then Release to refresh", () => {
    shell(<Detail />);
    const body = screen.getByTestId("body");
    drag(body, [200, 100], [200, 130], false);
    expect(document.querySelector(".fx-pull")).toHaveTextContent("Pull to refresh");
    touch(body, "touchMove", 200, 250);
    expect(document.querySelector(".fx-pull")).toHaveTextContent("Release to refresh");
  });

  it("pull to refresh with no refresh function shows no Updated text", () => {
    render(<GestureLayer><PullBox /></GestureLayer>);
    const box = screen.getByTestId("pull-box");
    drag(box, [200, 100], [200, 250], false);
    expect(document.querySelector(".fx-pull")).toHaveTextContent("Release to refresh");
    touch(box, "touchEnd", 200, 250);
    expect(document.querySelector(".fx-pull.is-on")).toBeNull();
  });

  it("pull to refresh reports a refresh that answers false", async () => {
    render(<GestureLayer><PullBox onRefresh={() => Promise.resolve(false)} /></GestureLayer>);
    drag(screen.getByTestId("pull-box"), [200, 100], [200, 250]);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(document.querySelector(".fx-pull")).toHaveTextContent("Could not update. Try again.");
  });

  it("search finds seeded rows, and the page's own rows win over a seed", async () => {
    const find = async (term: string) => {
      fireEvent.click(screen.getByRole("button", { name: "Search" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      fireEvent.change(screen.getByRole("combobox"), { target: { value: term } });
      const hit = screen.queryAllByRole("option").length;
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      return hit;
    };
    const view = render(<AppShell business={business} searchRows={[]}><SeedAndOwn own={false} /></AppShell>);
    expect(await find("Seeded")).toBe(1);
    view.rerender(<AppShell business={business} searchRows={[]}><SeedAndOwn own /></AppShell>);
    expect(await find("Seeded")).toBe(0);
    expect(await find("Handed")).toBe(1);
  });

  it("a short pull springs back without refreshing", () => {
    shell(<Detail />);
    const body = screen.getByTestId("body");
    drag(body, [200, 100], [200, 180]);
    expect(document.querySelector(".fx-pull.is-on")).toBeNull();
  });
});
