// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

// The shell stand-in. useKeptReducer keeps state in `kept`, as the shell's page store does.
const kept = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("@/features/app-shell", async (original) => {
  const real = await original<typeof import("@/features/app-shell")>();
  const React = await import("react");
  return {
    ...real,
    PageAction: ({ children }: { children: React.ReactNode }) => <div data-testid="action">{children}</div>,
    usePushed: () => {},
    useBusiness: () => real.buildBusiness({ name: "Test Roofing Co", city: "Testville", state: "TS" }),
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
import { LeadsPage } from "@/features/leads";
import { READY } from "./fixtures";

function setUrl(search: string) {
  nav.search = search;
  window.history.replaceState(null, "", `/leads${search}`);
}
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
const row = (id: string) => document.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
const pick = (id: string) =>
  act(() => {
    window.dispatchEvent(new CustomEvent(ROW_PICK_EVENT, { detail: id }));
  });
const page = () => render(<GestureLayer><LeadsPage result={READY} /></GestureLayer>);
const checked = (name: RegExp) => screen.getByRole("radio", { name });

let phone = false;
const realMatchMedia = window.matchMedia;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  setUrl("");
  setWidth(1280);
  phone = false;
  window.matchMedia = ((query: string) => ({
    matches: phone && query.includes("max-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  kept.store.clear();
  nav.push.mockClear();
});
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
  setWidth(1024);
});

describe("a lead row's menu and swipe", () => {
  it("Shift+F10 opens the row's buttons as a menu, and an item runs that button", async () => {
    page();
    const maria = row("ld-1")!;
    act(() => {
      fireEvent.keyDown(within(maria).getByRole("button", { name: "Call Maria Alvarez" }), { key: "F10", shiftKey: true });
    });
    const menu = await screen.findByRole("menu", { name: "Actions for Maria Alvarez" });
    expect(within(menu).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Call", "Book visit"]);
    act(() => {
      within(menu).getByRole("menuitem", { name: "Book visit" }).click();
    });
    await waitFor(() => expect(within(row("ld-1")!).getByText("Estimate booked")).toBeInTheDocument());
  });

  it("a booked lead's menu offers Undo booking; a lead that waits on a text offers Reply", async () => {
    page();
    act(() => {
      fireEvent.contextMenu(row("ld-4")!, { clientX: 0, clientY: 0 });
    });
    let menu = await screen.findByRole("menu", { name: "Actions for Sam Whitaker" });
    expect(within(menu).getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["Call", "Undo booking"]);
    act(() => {
      fireEvent.keyDown(menu, { key: "Escape" });
    });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    act(() => {
      fireEvent.contextMenu(row("ld-2")!, { clientX: 0, clientY: 0 });
    });
    menu = await screen.findByRole("menu", { name: "Actions for Jordan Reyes" });
    expect(within(menu).getAllByRole("menuitem")[0]).toHaveTextContent(/^Reply$/);
  });

  it("a full swipe right runs the main button (Call)", () => {
    setWidth(390);
    page();
    const maria = row("ld-1")!;
    maria.getBoundingClientRect = () => ({ left: 0, top: 100, width: 390, height: 80, right: 390, bottom: 180, x: 0, y: 100, toJSON: () => ({}) }) as DOMRect;
    const at = (x: number) => [{ clientX: x, clientY: 130 }];
    act(() => {
      fireEvent.touchStart(maria, { touches: at(100), changedTouches: at(100) });
    });
    act(() => {
      fireEvent.touchMove(maria, { touches: at(170), changedTouches: at(170) });
    });
    act(() => {
      fireEvent.touchMove(maria, { touches: at(260), changedTouches: at(260) });
    });
    act(() => {
      fireEvent.touchEnd(maria, { touches: [], changedTouches: at(260) });
    });
    expect(within(row("ld-1")!).getByText("Called just now")).toBeInTheDocument();
  });
});

describe("a search result picked again", () => {
  it("shows all leads again when the owner filtered the lead away after the first pick", async () => {
    const user = userEvent.setup();
    setUrl("?row=ld-6");
    page();
    await user.click(checked(/24\+/));
    expect(row("ld-6")).toBeNull();
    pick("ld-6");
    expect(checked(/^All/)).toHaveAttribute("aria-checked", "true");
    expect(row("ld-6")).not.toBeNull();
  });

  it("a ?row= for a lead already shown keeps the filter", async () => {
    const user = userEvent.setup();
    const { rerender } = page();
    await user.click(checked(/24\+/));
    expect(row("ld-3")).not.toBeNull();
    setUrl("?row=ld-3");
    rerender(<GestureLayer><LeadsPage result={READY} /></GestureLayer>);
    pick("ld-3");
    expect(checked(/24\+/)).toHaveAttribute("aria-checked", "true");
  });

  it("finds a hand-added lead and shows all leads for it", async () => {
    const user = userEvent.setup();
    page();
    await user.type(screen.getByLabelText("Name"), "Pat Test");
    await user.type(screen.getByLabelText("Phone"), "6145550100");
    await user.click(screen.getByRole("button", { name: /^Add lead$/ }));
    expect(row("added-1")).not.toBeNull();
    await user.click(checked(/24\+/));
    expect(row("added-1")).toBeNull();
    pick("added-1");
    expect(checked(/^All/)).toHaveAttribute("aria-checked", "true");
    expect(row("added-1")).not.toBeNull();
  });
});

describe("hand-added leads", () => {
  it("the list keeps the newest 3; the sources panel counts all of them", async () => {
    const user = userEvent.setup();
    page();
    for (const name of ["One", "Two", "Three", "Four"]) {
      await user.type(screen.getByLabelText("Name"), name);
      await user.type(screen.getByLabelText("Phone"), "6145550100");
      await user.click(screen.getByRole("button", { name: /^Add lead$/ }));
    }
    expect(document.querySelectorAll(".fd-lst > .fd-rw.is-new")).toHaveLength(3);
    expect(screen.queryByText("One")).toBeNull();
    expect(checked(/^All/)).toHaveTextContent("11");
    expect(screen.getByText(/The 12 leads of this week\./)).toBeInTheDocument();
  });
});

describe("the phone add sheet", () => {
  const openSheet = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(within(screen.getByTestId("action")).getByRole("button", { name: "Add a lead" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a lead by hand" });
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus());
    return dialog;
  };

  it("keeps Tab inside the sheet, both ways", async () => {
    phone = true;
    setWidth(390);
    const user = userEvent.setup();
    page();
    const dialog = await openSheet(user);
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    cancel.focus();
    await user.tab();
    expect(screen.getByLabelText("Where the lead came from")).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
    for (let n = 0; n < 8; n++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("Escape closes it and gives the focus back to Add a lead", async () => {
    phone = true;
    setWidth(390);
    const user = userEvent.setup();
    page();
    await openSheet(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(within(screen.getByTestId("action")).getByRole("button", { name: "Add a lead" })).toHaveFocus());
  });

  it("Escape also closes it with the focus outside the sheet", async () => {
    phone = true;
    setWidth(390);
    const user = userEvent.setup();
    page();
    await openSheet(user);
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
