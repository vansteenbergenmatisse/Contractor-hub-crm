// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pipeline",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

const shell = vi.hoisted(() => ({ sendTimer: vi.fn(), askReason: vi.fn() }));
vi.mock("@/features/app-shell", async (original) => {
  const real = await original<typeof import("@/features/app-shell")>();
  const React = await import("react");
  return {
    ...real,
    useShell: () => ({ sendTimer: shell.sendTimer, askReason: shell.askReason }),
    PageAction: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useUndoShortcut: () => {},
    useKeptReducer: <S, A, I>(_key: string, reducer: React.Reducer<S, A>, arg: I, init: (a: I) => S) => React.useReducer(reducer, arg, init),
  };
});

const sync = vi.hoisted(() => ({ syncStageMove: vi.fn() }));
vi.mock("../../../src/features/pipeline/api/stage-sync", () => sync);

import { GestureLayer } from "@/features/app-shell";
import { MOCK_CARDS, PipelinePage } from "@/features/pipeline";

const said = vi.fn();
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
const card = (name: string) => document.querySelector<HTMLElement>(`article[aria-label="${name}"]`)!;
const board = () => document.querySelector<HTMLElement>(".fd-kb")!;
const page = () => render(<div className="fd-app"><GestureLayer onSay={said}><PipelinePage /></GestureLayer></div>);
const moveButton = (name: string) => within(card(name)).getByRole("button", { name: `Move ${name} to another stage` });
const rect = (left: number, right: number, top = 0, bottom = 900) => ({ left, right, top, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

// The columns of the group in view, 200px each from x=0; every other header is hidden (a zero rect).
// The four group tabs sit above the grid, at y 1000-1050 so they are outside its box.
const GROUP_SPANS = [[0, 4], [5, 7], [8, 8], [9, 10]];
function layOutColumns() {
  document.querySelectorAll<HTMLElement>(".fd-kh").forEach((h) => {
    const k = Number(/is-s(\d+)/.exec(h.className)![1]);
    h.getBoundingClientRect = () => {
      const [first, last] = GROUP_SPANS[Number(/is-g(\d)/.exec(board().className)![1])];
      return k >= first && k <= last ? rect((k - first) * 200, (k - first + 1) * 200) : rect(0, 0, 0, 0);
    };
  });
  document.querySelector<HTMLElement>(".fd-kg")!.getBoundingClientRect = () => rect(0, 1000);
  document.querySelectorAll<HTMLElement>(".fd-sgb").forEach((t, j) => {
    t.getBoundingClientRect = () => rect(j * 200, (j + 1) * 200, 1000, 1050);
  });
}
const ghost = () => document.querySelector<HTMLElement>("[data-drag-ghost]");

const mouse = { pointerType: "mouse", button: 0, pointerId: 1 };
function drag(el: Element, from: [number, number], to: [number, number]) {
  act(() => { fireEvent.pointerDown(el, { ...mouse, clientX: from[0], clientY: from[1] }); });
  act(() => { fireEvent.pointerMove(window, { ...mouse, clientX: to[0], clientY: to[1] }); });
}
const release = (x: number, y: number) => act(() => { fireEvent.pointerUp(window, { ...mouse, clientX: x, clientY: y }); });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  setWidth(1280);
  said.mockClear();
  shell.askReason.mockClear();
  sync.syncStageMove.mockClear();
});
afterEach(() => {
  cleanup();
  setWidth(1024);
});

describe("choosing a stage", () => {
  it("the Move button opens a sheet of the other stages, without the card's own", async () => {
    const user = userEvent.setup();
    page();
    await user.click(moveButton("Maria Alvarez"));
    const sheet = await screen.findByRole("dialog", { name: "Move Maria Alvarez to" });
    const names = within(sheet).getAllByRole("button").map((b) => b.textContent);
    expect(names).not.toContain("New Lead");
    expect(names).toContain("Job to Schedule");
    expect(names).toContain("Lost");
    expect(names.at(-1)).toBe("Cancel");
  });

  it("choosing a stage moves the card, says so, tells the seam, and offers Undo", async () => {
    const user = userEvent.setup();
    page();
    await user.click(moveButton("Maria Alvarez"));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Job to Schedule" }));
    expect(card("Maria Alvarez").className).toContain("is-s5");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(said).toHaveBeenCalledWith("Maria Alvarez moved to Job to Schedule.");
    expect(sync.syncStageMove).toHaveBeenCalledExactlyOnceWith({ i: 0, to: 5, undone: false, via: "manual" });
    await waitFor(() => expect(document.querySelector(".fd-kstub .fd-sun")).toHaveFocus());
  });

  it("works by keyboard alone, and Undo puts the card back and is announced", async () => {
    const user = userEvent.setup();
    page();
    moveButton("Maria Alvarez").focus();
    await user.keyboard("{Enter}");
    const sheet = await screen.findByRole("dialog");
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    within(sheet).getByRole("button", { name: "Following Up" }).focus();
    await user.keyboard("{Enter}");
    expect(card("Maria Alvarez").className).toContain("is-s1");
    await waitFor(() => expect(document.querySelector(".fd-kstub .fd-sun")).toHaveFocus());
    await user.keyboard("{Enter}");
    expect(card("Maria Alvarez").className).toContain("is-s0");
    expect(said).toHaveBeenLastCalledWith("Undone. Maria Alvarez is back in New Lead.");
    expect(sync.syncStageMove).toHaveBeenLastCalledWith({ i: 0, to: 0, undone: true, via: "manual" });
  });

  it("after Undo from the note, focus lands on the card that came back", async () => {
    const user = userEvent.setup();
    page();
    await user.click(moveButton("Maria Alvarez"));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Following Up" }));
    await waitFor(() => expect(document.querySelector(".fd-kstub .fd-sun")).toHaveFocus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(moveButton("Maria Alvarez")).toHaveFocus());
  });

  it("Escape closes the sheet, moves nothing and gives focus back", async () => {
    const user = userEvent.setup();
    page();
    const button = moveButton("Maria Alvarez");
    button.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(card("Maria Alvarez").className).toContain("is-s0");
    await waitFor(() => expect(button).toHaveFocus());
    expect(sync.syncStageMove).not.toHaveBeenCalled();
  });

  it("choosing Lost asks for the reason before anything moves", async () => {
    const user = userEvent.setup();
    page();
    await user.click(moveButton("Maria Alvarez"));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Lost" }));
    await waitFor(() => expect(shell.askReason).toHaveBeenCalledWith(expect.objectContaining({ name: "Maria Alvarez" })));
    expect(card("Maria Alvarez").className).toContain("is-s0");
    act(() => shell.askReason.mock.calls[0][0].onPick("Said no"));
    expect(card("Maria Alvarez").className).toContain("is-s10");
    expect(said).toHaveBeenCalledWith("Maria Alvarez moved to Lost.");
  });

  it("the card's menu (long press, right-click) opens the same sheet", async () => {
    page();
    act(() => { fireEvent.contextMenu(card("Maria Alvarez"), { clientX: 0, clientY: 0 }); });
    const menu = await screen.findByRole("menu");
    act(() => { within(menu).getByRole("menuitem", { name: "Move Maria Alvarez to another stage" }).click(); });
    expect(await screen.findByRole("dialog", { name: "Move Maria Alvarez to" })).toBeInTheDocument();
  });
});

describe("dragging a card on the computer", () => {
  it("drops the card on the column under the pointer, with Undo", () => {
    page();
    layOutColumns();
    const el = card("Maria Alvarez");
    drag(el, [100, 200], [650, 220]);
    release(650, 220);
    expect(card("Maria Alvarez").className).toContain("is-s3");
    expect(ghost()).toBeNull();
    expect(said).toHaveBeenCalledWith("Maria Alvarez moved to Quote to Send.");
    expect(within(card("Maria Alvarez")).getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("the card follows the pointer and the target column's line lights up", () => {
    page();
    layOutColumns();
    const el = card("Maria Alvarez");
    drag(el, [100, 200], [650, 220]);
    expect(ghost()!.style.transform).toBe("translate(550px, 20px)");
    const lines = document.querySelectorAll(".fd-kls i");
    expect(lines[3]).toHaveClass("is-sel");
    expect(lines[0]).not.toHaveClass("is-sel");
    release(650, 220);
  });

  it("a press that moves less than 8px is not a drag", () => {
    page();
    layOutColumns();
    drag(card("Maria Alvarez"), [100, 200], [103, 202]);
    release(103, 202);
    expect(card("Maria Alvarez").className).toContain("is-s0");
    expect(said).not.toHaveBeenCalled();
  });

  it("a drop outside the columns, or on its own column, moves nothing", () => {
    page();
    layOutColumns();
    drag(card("Maria Alvarez"), [100, 200], [1500, 200]);
    release(1500, 200);
    drag(card("Maria Alvarez"), [100, 200], [150, 400]);
    release(150, 400);
    expect(card("Maria Alvarez").className).toContain("is-s0");
    expect(sync.syncStageMove).not.toHaveBeenCalled();
  });

  it("Escape cancels the drag", () => {
    page();
    layOutColumns();
    const el = card("Maria Alvarez");
    drag(el, [100, 200], [650, 220]);
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(ghost()).toBeNull();
    expect(el.style.opacity).toBe("");
    release(650, 220);
    expect(card("Maria Alvarez").className).toContain("is-s0");
  });

  it("a drag that starts on a button does not move the card, and the button still works", async () => {
    // the guard against the click that ends the drag in the test before lasts 50ms
    await new Promise((r) => setTimeout(r, 60));
    page();
    layOutColumns();
    const button = within(card("Maria Alvarez")).getByRole("button", { name: "Book visit" });
    drag(button, [100, 200], [650, 220]);
    release(650, 220);
    expect(card("Maria Alvarez").className).toContain("is-s0");
    act(() => button.click());
    expect(card("Maria Alvarez").className).toContain("is-s2");
  });

  it("the click that ends a drag does not press what is under the pointer", () => {
    page();
    layOutColumns();
    drag(card("Maria Alvarez"), [100, 200], [650, 220]);
    release(650, 220);
    const onClick = vi.fn();
    const target = document.querySelector<HTMLElement>(".fd-kg")!;
    target.addEventListener("click", onClick);
    act(() => target.click());
    expect(onClick).not.toHaveBeenCalled();
    target.removeEventListener("click", onClick);
  });
});

describe("touch stays as it was", () => {
  it("a finger never drags a card, so the page can scroll", () => {
    page();
    layOutColumns();
    const el = card("Maria Alvarez");
    act(() => { fireEvent.pointerDown(el, { pointerType: "touch", button: 0, pointerId: 2, clientX: 100, clientY: 200 }); });
    act(() => { fireEvent.pointerMove(window, { pointerType: "touch", pointerId: 2, clientX: 650, clientY: 500 }); });
    expect(ghost()).toBeNull();
    act(() => { fireEvent.pointerUp(window, { pointerType: "touch", pointerId: 2, clientX: 650, clientY: 500 }); });
    expect(card("Maria Alvarez").className).toContain("is-s0");
  });

  it("the card sets no touch-action, so vertical scrolling is untouched", () => {
    page();
    expect(card("Maria Alvarez").style.touchAction).toBe("");
  });

  it("a mouse on a phone-width window does not drag either", () => {
    setWidth(390);
    page();
    layOutColumns();
    const el = card("Maria Alvarez");
    drag(el, [100, 200], [650, 220]);
    expect(ghost()).toBeNull();
    release(650, 220);
    expect(card("Maria Alvarez").className).toContain("is-s0");
  });

  it("a long press still opens the card's menu", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      page();
      const el = card("Maria Alvarez");
      act(() => { fireEvent.touchStart(el, { touches: [{ clientX: 100, clientY: 200 }], changedTouches: [{ clientX: 100, clientY: 200 }] }); });
      act(() => { vi.advanceTimersByTime(520); });
      expect(screen.getByRole("menu", { name: "Actions for Maria Alvarez" })).toBeInTheDocument();
      act(() => { fireEvent.touchEnd(el, { touches: [], changedTouches: [{ clientX: 100, clientY: 200 }] }); });
    } finally {
      vi.useRealTimers();
    }
  });

  it("the stage swipe still works on an open stage", async () => {
    setWidth(390);
    const user = userEvent.setup();
    page();
    await user.click(document.querySelectorAll<HTMLElement>(".fd-sgt > button")[1]);
    const grid = document.querySelector(".fd-kg")!;
    act(() => { fireEvent.touchStart(grid, { touches: [{ clientX: 300, clientY: 300 }], changedTouches: [{ clientX: 300, clientY: 300 }] }); });
    act(() => { fireEvent.touchEnd(grid, { touches: [], changedTouches: [{ clientX: 100, clientY: 305 }] }); });
    expect(board()).toHaveClass("is-st2");
    await new Promise((r) => setTimeout(r, 500));
  });
});

describe("the other move buttons go through the same seam", () => {
  it("a card's main button tells the seam and is announced", async () => {
    const user = userEvent.setup();
    page();
    await user.click(within(card("Maria Alvarez")).getByRole("button", { name: "Book visit" }));
    expect(sync.syncStageMove).toHaveBeenCalledExactlyOnceWith({ i: 0, to: 2, undone: false, via: "manual" });
    expect(said).toHaveBeenCalledWith("Maria Alvarez moved to Estimate Booked.");
  });
});

const nameIn = (stage: number) => MOCK_CARDS.find((c) => c.stage === stage)!.name;
const hoverTab = (j: number) => act(() => { fireEvent.pointerMove(window, { ...mouse, clientX: j * 200 + 50, clientY: 1020 }); });
const settle = () => new Promise((r) => setTimeout(r, 60));

describe("the send and payment rules", () => {
  it("the sheet shows Quote Sent and Payment Due unavailable, with the reason", async () => {
    const user = userEvent.setup();
    page();
    await user.click(moveButton("Maria Alvarez"));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByRole("button", { name: /Quote Sent.*Use Send quote/ })).toBeDisabled();
    expect(within(sheet).getByRole("button", { name: /Payment Due.*Use Invoice/ })).toBeDisabled();
  });

  it("a drop on Quote Sent moves nothing and does not light its line", async () => {
    await settle();
    page();
    layOutColumns();
    drag(card("Maria Alvarez"), [100, 200], [850, 220]);
    expect(document.querySelectorAll(".fd-kls i")[4]).not.toHaveClass("is-sel");
    release(850, 220);
    expect(card("Maria Alvarez").className).toContain("is-s0");
    expect(sync.syncStageMove).not.toHaveBeenCalled();
  });

  it("a Payment Due card has no Move control and cannot be dragged", async () => {
    await settle();
    const user = userEvent.setup();
    const name = nameIn(8);
    page();
    await user.click(document.querySelectorAll<HTMLElement>(".fd-sgb")[2]);
    layOutColumns();
    expect(within(card(name)).queryByRole("button", { name: `Move ${name} to another stage` })).toBeNull();
    drag(card(name), [100, 200], [120, 260]);
    expect(ghost()).toBeNull();
    release(120, 260);
    act(() => { fireEvent.contextMenu(card(name), { clientX: 0, clientY: 0 }); });
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByRole("menuitem", { name: /another stage/ })).toBeNull();
    await user.keyboard("{Escape}");
  });

  it("a send tells the seam it was a send", async () => {
    await settle();
    const user = userEvent.setup();
    const name = "Derek Olsen";
    const i = MOCK_CARDS.findIndex((c) => c.name === name);
    shell.sendTimer.mockClear();
    page();
    await user.click(within(card(name)).getByRole("button", { name: "Send quote" }));
    act(() => shell.sendTimer.mock.calls[0][0].onDone());
    expect(sync.syncStageMove).toHaveBeenCalledExactlyOnceWith({ i, to: 4, undone: false, via: "send" });
  });
});

describe("dragging to another group", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
  // let the 50ms click guard of the last drag end before the clock goes back to real time
  afterEach(() => { vi.advanceTimersByTime(60); vi.useRealTimers(); });
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

  it("holding over a group tab for 500ms opens that group, and the card can drop there", () => {
    wait(60);
    page();
    layOutColumns();
    drag(card("Maria Alvarez"), [100, 200], [120, 220]);
    hoverTab(1);
    wait(450);
    expect(board()).toHaveClass("is-g0");
    wait(60);
    expect(board()).toHaveClass("is-g1");
    expect(ghost()).not.toBeNull();
    act(() => { fireEvent.pointerMove(window, { ...mouse, clientX: 250, clientY: 300 }); });
    release(250, 300);
    expect(card("Maria Alvarez").className).toContain("is-s6");
  });

  it("leaving the tab early does not switch", () => {
    wait(60);
    page();
    layOutColumns();
    drag(card("Maria Alvarez"), [100, 200], [120, 220]);
    hoverTab(1);
    wait(300);
    act(() => { fireEvent.pointerMove(window, { ...mouse, clientX: 120, clientY: 220 }); });
    wait(400);
    expect(board()).toHaveClass("is-g0");
    release(120, 220);
  });

  it("Escape cancels and brings back the original group", () => {
    wait(60);
    page();
    layOutColumns();
    drag(card("Maria Alvarez"), [100, 200], [120, 220]);
    hoverTab(3);
    wait(520);
    expect(board()).toHaveClass("is-g3");
    act(() => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(board()).toHaveClass("is-g0", "is-st0");
    expect(ghost()).toBeNull();
    release(120, 220);
    expect(card("Maria Alvarez").className).toContain("is-s0");
  });

  it("a drop off every column after a switch also brings back the original group", () => {
    wait(60);
    page();
    layOutColumns();
    drag(card("Maria Alvarez"), [100, 200], [120, 220]);
    hoverTab(1);
    wait(520);
    release(1500, 300);
    expect(board()).toHaveClass("is-g0");
    expect(card("Maria Alvarez").className).toContain("is-s0");
  });
});

describe("the sheet by keyboard", () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    moveButton("Maria Alvarez").focus();
    await user.keyboard("{Enter}");
    const sheet = await screen.findByRole("dialog");
    await waitFor(() => expect(within(sheet).getByRole("button", { name: "Following Up" })).toHaveFocus());
    return sheet;
  };

  it("arrows, Home and End move between the enabled stages and skip the unavailable ones", async () => {
    const user = userEvent.setup();
    page();
    const sheet = await open(user);
    const focused = () => document.activeElement?.textContent;
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(focused()).toBe("Quote to Send");
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("Job to Schedule");
    await user.keyboard("{ArrowUp}");
    expect(focused()).toBe("Quote to Send");
    await user.keyboard("{End}");
    expect(focused()).toBe("Lost");
    await user.keyboard("{ArrowDown}");
    expect(focused()).toBe("Following Up");
    await user.keyboard("{End}{Home}");
    expect(focused()).toBe("Following Up");
    expect(sheet).toBeInTheDocument();
  });

  it("Ctrl or Cmd Z does nothing behind the open sheet", async () => {
    const user = userEvent.setup();
    page();
    await user.click(within(card("Jordan Reyes")).getByRole("button", { name: "Book visit" }));
    await open(user);
    expect(fireEvent.keyDown(document.activeElement!, { key: "z", metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(document.activeElement!, { key: "z", ctrlKey: true })).toBe(false);
    expect(card("Jordan Reyes").className).toContain("is-s2");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("from the card's menu, focus enters the sheet and Escape returns it to the card", async () => {
    const user = userEvent.setup();
    page();
    act(() => { fireEvent.keyDown(within(card("Maria Alvarez")).getByRole("button", { name: "Book visit" }), { key: "F10", shiftKey: true }); });
    const menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Move Maria Alvarez to another stage" }));
    const sheet = await screen.findByRole("dialog");
    await waitFor(() => expect(within(sheet).getByRole("button", { name: "Following Up" })).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(card("Maria Alvarez").contains(document.activeElement)).toBe(true));
  });
});

describe("one announcement per move", () => {
  it("the note a moved card leaves is not a live region", async () => {
    const user = userEvent.setup();
    page();
    await user.click(moveButton("Maria Alvarez"));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Following Up" }));
    const stub = document.querySelector(".fd-kstub")!;
    expect(stub).not.toHaveAttribute("aria-live");
    expect(stub).not.toHaveAttribute("role");
    expect(said).toHaveBeenCalledTimes(1);
  });

  it("a stage count that changes is outside every live region", () => {
    page();
    document.querySelectorAll(".fd-kcn").forEach((n) => expect(n.closest("[aria-live]")).toBeNull());
  });
});
