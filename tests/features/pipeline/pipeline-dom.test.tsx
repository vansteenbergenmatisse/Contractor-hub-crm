// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/pipeline",
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

// The shell stand-in: PageAction draws its children in place so the stage bar can be tested, and
// useKeptReducer keeps state in `kept` (as the shell's page store does) and records its keys.
const kept = vi.hoisted(() => ({ store: new Map<string, unknown>(), keys: new Set<string>(), undo: null as (() => void) | null }));
vi.mock("@/features/app-shell", async (original) => {
  const real = await original<typeof import("@/features/app-shell")>();
  const React = await import("react");
  return {
    ...real,
    useShell: () => ({ sendTimer: vi.fn(), askReason: vi.fn() }),
    PageAction: ({ children }: { children: React.ReactNode }) => <div data-testid="action">{children}</div>,
    // Records what ⌘Z would run (the shell calls the newest registration).
    useUndoShortcut: (undo: (() => void) | null) => {
      kept.undo = undo;
    },
    useKeptReducer: <S, A, I>(key: string, reducer: React.Reducer<S, A>, arg: I, init: (a: I) => S) => {
      kept.keys.add(key);
      const [state, dispatch] = React.useReducer(reducer, arg, (a: I) => (kept.store.has(key) ? (kept.store.get(key) as S) : init(a)));
      React.useEffect(() => {
        kept.store.set(key, state);
      }, [key, state]);
      return [state, dispatch] as const;
    },
  };
});

import { PipelinePage } from "@/features/pipeline";

const RIGHT = "m9 6 6 6-6 6";

function setUrl(search: string) {
  nav.search = search;
  window.history.replaceState(null, "", `/pipeline${search}`);
}

const card = (name: string) => document.querySelector<HTMLElement>(`article[aria-label="${name}"]`)!;
const board = () => document.querySelector<HTMLElement>(".fd-kb")!;

let scrolled: Element[] = [];
beforeEach(() => {
  scrolled = [];
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
  setUrl("");
  kept.store.clear();
});
afterEach(() => cleanup());

describe("stage arrows", () => {
  it("draws Previous and Next with the same right chevron, so the CSS turn of .fd-sprev makes Previous point left", async () => {
    const user = userEvent.setup();
    render(<PipelinePage />);
    await user.click(screen.getAllByRole("button", { name: /Following Up/ }).find((b) => b.classList.contains("fd-sti"))!);
    const prevs = screen.getAllByRole("button", { name: "Previous stage" });
    expect(prevs).toHaveLength(2);
    for (const b of prevs) {
      expect(b).toHaveClass("fd-sprev");
      expect(b.querySelector("path")!.getAttribute("d")).toBe(RIGHT);
    }
    for (const b of screen.getAllByRole("button", { name: "Next stage" })) {
      expect(b).not.toHaveClass("fd-sprev");
      expect(b.querySelector("path")!.getAttribute("d")).toBe(RIGHT);
    }
  });

  it("Previous and Next in the stage bar step through the stages", async () => {
    const user = userEvent.setup();
    render(<PipelinePage />);
    await user.click(screen.getAllByRole("button", { name: /Following Up/ }).find((b) => b.classList.contains("fd-sti"))!);
    const bar = screen.getByTestId("action");
    await user.click(within(bar).getByRole("button", { name: "Next stage" }));
    expect(board()).toHaveClass("is-st2");
    await user.click(within(bar).getByRole("button", { name: "Previous stage" }));
    await user.click(within(bar).getByRole("button", { name: "Previous stage" }));
    expect(board()).toHaveClass("is-st0");
    expect(within(bar).getByRole("button", { name: "Previous stage" })).toBeDisabled();
  });
});

describe("state survives moving between pages", () => {
  function Shell() {
    const [shown, setShown] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setShown((s) => !s)}>switch page</button>
        {shown ? <PipelinePage /> : <p>another page</p>}
      </>
    );
  }

  it("keeps a moved card in its new stage after leaving and coming back", async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(within(card("Maria Alvarez")).getByRole("button", { name: "Book visit" }));
    expect(card("Maria Alvarez").className).toContain("is-s2");
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(screen.getByText("another page")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(card("Maria Alvarez").className).toContain("is-s2");
    expect(within(card("Maria Alvarez")).getByText("Moved just now")).toBeInTheDocument();
    expect([...kept.keys]).toEqual(["pipeline"]);
  });
});

describe("⌘Z", () => {
  it("registers the board's Undo while Undo shows, and running it puts the card back", async () => {
    const user = userEvent.setup();
    render(<PipelinePage />);
    expect(kept.undo).toBeNull();
    await user.click(within(card("Maria Alvarez")).getByRole("button", { name: "Book visit" }));
    expect(within(card("Maria Alvarez")).getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(kept.undo).toBeTypeOf("function");
    act(() => kept.undo!());
    expect(card("Maria Alvarez").className).toContain("is-s0");
    expect(kept.undo).toBeNull();
  });
});

describe("?row= from the search", () => {
  it("opens the stage of the card and brings the card into view", async () => {
    setUrl("?row=pipeline-13");
    render(<PipelinePage />);
    await waitFor(() => expect(board()).toHaveClass("is-st3"));
    expect(board()).toHaveClass("is-open");
    await waitFor(() => expect(scrolled).toContain(card("Derek Olsen")));
  });

  it("also works when the page is already open", async () => {
    const { rerender } = render(<PipelinePage />);
    expect(board()).toHaveClass("is-st0");
    setUrl("?row=pipeline-21");
    rerender(<PipelinePage />);
    await waitFor(() => expect(board()).toHaveClass("is-st6"));
    await waitFor(() => expect(scrolled).toContain(card("Owen Fletcher")));
  });

  it("follows a card that moved: it opens the stage the card is in now", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<PipelinePage />);
    await user.click(within(card("Maria Alvarez")).getByRole("button", { name: "Book visit" }));
    setUrl("?row=pipeline-0");
    rerender(<PipelinePage />);
    await waitFor(() => expect(board()).toHaveClass("is-st2"));
    await waitFor(() => expect(scrolled).toContain(card("Maria Alvarez")));
  });

  it("ignores a row that is not a pipeline card", async () => {
    setUrl("?row=quote-q3");
    render(<PipelinePage />);
    await new Promise((r) => setTimeout(r, 20));
    expect(board()).toHaveClass("is-st0");
    expect(scrolled).toHaveLength(0);
  });
});
