// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ search: "" }));
// Stands in for the shell's page-state store (it lives in the signed-in layout and outlives a page).
const kept = vi.hoisted(() => new Map<string, unknown>());
const timer = vi.hoisted(() => ({ calls: [] as Array<{ name: string; onDone: () => void }> }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/invoices",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/features/app-shell", async () => {
  const actual = await vi.importActual<typeof import("@/features/app-shell")>("@/features/app-shell");
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useKeptReducer: <S, A, I>(key: string, reducer: (s: S, a: A) => S, arg: I, init: (a: I) => S) => {
      const [state, dispatch] = React.useReducer(reducer, arg, (a: I) => (kept.has(key) ? (kept.get(key) as S) : init(a)));
      React.useEffect(() => { kept.set(key, state); }, [key, state]);
      return [state, dispatch] as const;
    },
    useShell: () => ({ sendTimer: (req: { name: string; onDone: () => void }) => { timer.calls.push(req); }, askReason: vi.fn(), setPushed: vi.fn(), setAction: vi.fn() }),
    usePushed: () => {},
    useBusiness: () => ({ name: "", init: "", logoUrl: null }),
    useBusinessValues: () => ({}),
  };
});

import { GestureLayer } from "@/features/app-shell";
import { InvoicesPage } from "@/features/invoices";

const go = (search: string) => {
  nav.search = search;
  window.history.replaceState(null, "", `/invoices${search}`);
};
const row = (no: number) => document.getElementById(`fd-iv-r${no}`)!;
const Page = () => <div className="fd-app"><GestureLayer><InvoicesPage /></GestureLayer></div>;
const filter = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(".fd-flb")).find((b) => b.textContent === label)!;
const button = (no: number, text: string) => Array.from(row(no).querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === text)!;

let scrolled: string[] = [];
beforeEach(() => {
  scrolled = [];
  timer.calls.length = 0;
  Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(`${this.id}:${this.className}`); };
});
afterEach(() => {
  cleanup();
  kept.clear();
  go("");
  vi.useRealTimers();
});

describe("a search link reveals the row before it flashes (I-2)", () => {
  it("the row is already shown when useRowFocus scrolls to it and lays the flash", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = render(<Page />);
    await act(async () => { filter("Paid").click(); });
    expect(row(1042).className).toContain("is-off");
    go("?row=invoice-1042");
    view.rerender(<Page />);
    await act(async () => { vi.advanceTimersByTime(200); });
    const hit = scrolled.find((s) => s.startsWith("fd-iv-r1042:"));
    expect(hit).toBeDefined();
    expect(hit).not.toContain("is-off");
    expect(filter("All").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".fx-flash")).not.toBeNull();
  });

  it("a repeat pick of the same result shows the row again after the owner filtered it away", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    go("?row=invoice-1042");
    render(<Page />);
    await act(async () => { vi.advanceTimersByTime(200); });
    await act(async () => { filter("Paid").click(); });
    expect(row(1042).className).toContain("is-off");
    scrolled = [];
    await act(async () => { window.dispatchEvent(new CustomEvent("fx:row-pick", { detail: "invoice-1042" })); });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(row(1042).className).not.toContain("is-off");
    expect(scrolled.find((s) => s.startsWith("fd-iv-r1042:"))).not.toContain("is-off");
  });
});

describe("Back to the list (P50)", () => {
  it("gives the focus back to the row's View button", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Page />);
    await act(async () => { button(1044, "View").click(); });
    await act(async () => { screen.getByRole("button", { name: "Back to the list" }).click(); });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(document.activeElement?.id).toBe("fd-iv-v1044");
  });
});

describe("a late send never undoes a later change (P51)", () => {
  it("onDone marks a ready invoice sent once; a Mark paid after it stays paid when onDone runs again", async () => {
    render(<Page />);
    await act(async () => { button(1049, "Send invoice").click(); });
    expect(timer.calls.map((c) => c.name)).toEqual(["Hilliard Storage"]);
    await act(async () => { timer.calls[0].onDone(); });
    expect(row(1049).textContent).toContain("Sent just now");
    await act(async () => { button(1049, "Mark paid").click(); });
    expect(row(1049).textContent).toContain("Paid just now");
    await act(async () => { timer.calls[0].onDone(); });
    expect(row(1049).textContent).toContain("Paid just now");
    expect([...kept.keys()]).toEqual(["invoices"]);
  });
});

describe("the sheet's due line follows the design (I-3)", () => {
  it("shows the lateness alone for a late invoice and Due in 7 days right after a send", async () => {
    render(<Page />);
    await act(async () => { button(1042, "View").click(); });
    expect(document.querySelector("#fd-iv-sheet .fd-dcn + .fd-dcs")!.textContent).toBe("14 days late");
    await act(async () => { button(1049, "Send invoice").click(); });
    await act(async () => { timer.calls[0].onDone(); });
    expect(document.querySelector("#fd-iv-sheet .fd-dcn + .fd-dcs")!.textContent).toBe("Due in 7 days");
  });
});

describe("row menu (design uxItems: the row's shown buttons)", () => {
  const menuOf = (no: number) => {
    fireEvent.contextMenu(row(no), { clientX: 100, clientY: 100 });
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    return items;
  };
  it("lists each row type's actions", () => {
    render(<Page />);
    expect(menuOf(1049)).toEqual(["View", "Send invoice"]);
    expect(menuOf(1048)).toEqual(["View", "Make invoice"]);
    expect(menuOf(1045)).toEqual(["View", "Mark paid"]);
    expect(menuOf(1041)).toEqual(["View"]);
  });
  it("Mark paid from the menu marks the invoice paid", async () => {
    render(<Page />);
    fireEvent.contextMenu(row(1045), { clientX: 100, clientY: 100 });
    await act(async () => { screen.getByRole("menuitem", { name: "Mark paid" }).click(); await new Promise((r) => setTimeout(r, 20)); });
    expect(row(1045).textContent).toContain("Paid just now");
  });
});
