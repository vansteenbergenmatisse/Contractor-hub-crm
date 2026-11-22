// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/pipeline",
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

// The shell stand-in: the send timer and the reason sheet are recorded, PageAction draws in place and
// useKeptReducer keeps state in `kept`, as the shell's page store does.
const kept = vi.hoisted(() => ({ store: new Map<string, unknown>(), sendTimer: vi.fn(), askReason: vi.fn() }));
vi.mock("@/features/app-shell", async (original) => {
  const real = await original<typeof import("@/features/app-shell")>();
  const React = await import("react");
  return {
    ...real,
    useShell: () => ({ sendTimer: kept.sendTimer, askReason: kept.askReason }),
    PageAction: ({ children }: { children: React.ReactNode }) => <div data-testid="action">{children}</div>,
    useUndoShortcut: () => {},
    useKeptReducer: <S, A, I>(key: string, reducer: React.Reducer<S, A>, arg: I, init: (a: I) => S) => {
      const [state, dispatch] = React.useReducer(reducer, arg, (a: I) => (kept.store.has(key) ? (kept.store.get(key) as S) : init(a)));
      React.useEffect(() => {
        kept.store.set(key, state);
      }, [key, state]);
      return [state, dispatch] as const;
    },
  };
});

import { GestureLayer, ROW_PICK_EVENT } from "@/features/app-shell";
import { PipelinePage } from "@/features/pipeline";
import { SEED_QUOTES, initialState, quotesReducer } from "@/features/quotes";

function setUrl(search: string) {
  nav.search = search;
  window.history.replaceState(null, "", `/pipeline${search}`);
}
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
const card = (name: string) => document.querySelector<HTMLElement>(`article[aria-label="${name}"]`)!;
const board = () => document.querySelector<HTMLElement>(".fd-kb")!;
const stageBar = () => document.querySelector<HTMLElement>(".fd-sarr")!;
const stageButton = (k: number) => document.querySelectorAll<HTMLElement>(".fd-sgt > button")[k];
const page = () => render(<GestureLayer><PipelinePage /></GestureLayer>);

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  setUrl("");
  setWidth(1280);
  kept.store.clear();
  kept.sendTimer.mockClear();
  kept.askReason.mockClear();
  nav.push.mockClear();
});
afterEach(() => {
  cleanup();
  setWidth(1024);
});

describe("Previous and Next at the ends", () => {
  it("stay focusable with aria-disabled, keep the focus and do nothing", async () => {
    const user = userEvent.setup();
    page();
    const prev = within(stageBar()).getByRole("button", { name: "Previous stage" });
    expect(prev).not.toBeDisabled();
    expect(prev).toHaveAttribute("aria-disabled", "true");
    expect(prev).toHaveClass("is-dis");
    prev.focus();
    await user.click(prev);
    expect(prev).toHaveFocus();
    expect(board()).toHaveClass("is-st0");
    const next = within(stageBar()).getByRole("button", { name: "Next stage" });
    expect(next).not.toHaveAttribute("aria-disabled");
  });

  it("the last stage marks Next the same way", async () => {
    const user = userEvent.setup();
    page();
    await user.click(stageButton(10));
    const next = within(stageBar()).getByRole("button", { name: "Next stage" });
    expect(next).toHaveAttribute("aria-disabled", "true");
    next.focus();
    await user.click(next);
    expect(next).toHaveFocus();
    expect(board()).toHaveClass("is-st10");
  });
});

describe("swipe on the open stage (phone)", () => {
  const swipe = (el: Element, from: number, to: number) => {
    act(() => {
      fireEvent.touchStart(el, { touches: [{ clientX: from, clientY: 300 }], changedTouches: [{ clientX: from, clientY: 300 }] });
    });
    act(() => {
      fireEvent.touchEnd(el, { touches: [], changedTouches: [{ clientX: to, clientY: 305 }] });
    });
  };

  it("left goes to the next stage, right to the one before, only with a stage open", async () => {
    setWidth(390);
    const user = userEvent.setup();
    page();
    const grid = document.querySelector(".fd-kg")!;
    swipe(grid, 300, 100);
    expect(board()).toHaveClass("is-st0");
    await user.click(stageButton(1));
    expect(board()).toHaveClass("is-open", "is-st1");
    swipe(grid, 300, 100);
    expect(board()).toHaveClass("is-st2");
    swipe(grid, 100, 300);
    expect(board()).toHaveClass("is-st1");
    // a swipe swallows the click that follows it for 450ms; let that pass before the next test
    await new Promise((r) => setTimeout(r, 500));
  });
});

describe("a card's menu", () => {
  it("lists the card's buttons in order with Lost last, and runs the one picked", async () => {
    page();
    const derek = card("Derek Olsen");
    act(() => {
      fireEvent.keyDown(within(derek).getByRole("button", { name: "Send quote" }), { key: "F10", shiftKey: true });
    });
    const menu = await screen.findByRole("menu", { name: "Actions for Derek Olsen" });
    const items = within(menu).getAllByRole("menuitem").map((b) => b.textContent);
    expect(items).toEqual(["Send quote", "Job done", "See quote", "Move Derek Olsen to Lost"]);
    act(() => {
      within(menu).getByRole("menuitem", { name: "Move Derek Olsen to Lost" }).click();
    });
    await waitFor(() => expect(kept.askReason).toHaveBeenCalledWith(expect.objectContaining({ name: "Derek Olsen" })));
  });

  it("a card in Estimate Booked offers its calendar first", async () => {
    page();
    act(() => {
      fireEvent.contextMenu(card("Tom Becker"), { clientX: 0, clientY: 0 });
    });
    const menu = await screen.findByRole("menu", { name: "Actions for Tom Becker" });
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveTextContent("Open Tom Becker in the calendar");
  });
});

describe("Quote to Send reads the live Quotes state", () => {
  it("Priya Shah offers Add price while her quote needs a price, and Add price opens Quotes at the price", async () => {
    const user = userEvent.setup();
    page();
    const priya = card("Priya Shah");
    await user.click(within(priya).getByRole("button", { name: "Add price" }));
    expect(nav.push).toHaveBeenCalledWith("/quotes?row=quote-q1&open=price");
  });

  it("after the quote is built on Quotes, the card offers Send quote with the quote's own document", async () => {
    const user = userEvent.setup();
    const priya = SEED_QUOTES.find((q) => q.name === "Priya Shah")!;
    kept.store.set("quotes", quotesReducer(initialState(SEED_QUOTES), { type: "build", id: priya.id, low: 450, lines: [{ text: "Gutter repair", amount: 450 }] }));
    page();
    const el = card("Priya Shah");
    expect(within(el).getByText("Quote ready")).toBeInTheDocument();
    expect(within(el).getByRole("button", { name: "See quote" })).toBeInTheDocument();
    await user.click(within(el).getByRole("button", { name: "Send quote" }));
    expect(kept.sendTimer).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "Quote", name: "Priya Shah", total: "$450", doc: expect.objectContaining({ amount: "$450", lines: [["Gutter repair", "$450"]] }) }),
    );
  });

  it("See quote opens the quote's sheet on Quotes", async () => {
    const user = userEvent.setup();
    page();
    await user.click(within(card("Derek Olsen")).getByRole("button", { name: "See quote" }));
    expect(nav.push).toHaveBeenCalledWith("/quotes?row=quote-q0&open=sheet");
  });
});

describe("a search result picked again", () => {
  it("opens the card's stage again after the owner went to another stage", async () => {
    const user = userEvent.setup();
    setUrl("?row=pipeline-13");
    page();
    await waitFor(() => expect(board()).toHaveClass("is-open", "is-st3"));
    await user.click(within(stageBar()).getByRole("button", { name: "Next stage" }));
    expect(board()).toHaveClass("is-st4");
    act(() => {
      window.dispatchEvent(new CustomEvent(ROW_PICK_EVENT, { detail: "pipeline-13" }));
    });
    expect(board()).toHaveClass("is-open", "is-st3");
  });

  it("ignores a pick of a row that is not a card of this board", () => {
    page();
    act(() => {
      window.dispatchEvent(new CustomEvent(ROW_PICK_EVENT, { detail: "today-pipeline-2" }));
    });
    expect(board()).toHaveClass("is-st0");
    expect(board()).not.toHaveClass("is-open");
  });
});
