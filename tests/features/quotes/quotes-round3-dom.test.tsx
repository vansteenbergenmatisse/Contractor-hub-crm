// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ search: "" }));
// Stands in for the shell's page-state store (it lives in the signed-in layout and outlives a page).
const kept = vi.hoisted(() => new Map<string, unknown>());
vi.mock("next/navigation", () => ({
  usePathname: () => "/quotes",
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
    useShell: () => ({ sendTimer: vi.fn(), askReason: vi.fn(), setPushed: vi.fn(), setAction: vi.fn() }),
    usePushed: () => {},
    useBusinessValues: () => ({ business_name: "", business_address: "", business_phone_number: "", business_email: "", business_hours: "", business_website_url: "" }),
    useBusiness: () => ({ name: "", init: "" }),
  };
});

import { GestureLayer } from "@/features/app-shell";
import { QuotesPage } from "@/features/quotes";

const go = (search: string) => {
  nav.search = search;
  window.history.replaceState(null, "", `/quotes${search}`);
};
const row = (id: string) => document.getElementById(`fd-qt-${id}`)!;
const Page = () => <div className="fd-app"><GestureLayer><QuotesPage /></GestureLayer></div>;
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true });
const filterBtn = (label: string) => document.querySelector<HTMLButtonElement>(`.fd-flb[aria-label^="${label},"]`)!;

// What the row looked like when useRowFocus scrolled to it (it scrolls, then flashes the same box).
let scrolled: string[] = [];
beforeEach(() => {
  scrolled = [];
  Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(`${this.id}:${this.className}`); };
});
afterEach(() => {
  cleanup();
  kept.clear();
  go("");
  vi.useRealTimers();
  setWidth(1280);
});

describe("a search link reveals the row before it flashes", () => {
  it("the row is already shown when useRowFocus scrolls to it and lays the flash", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const view = render(<Page />);
    await act(async () => { filterBtn("Sent").click(); });
    expect(row("q0").className).toContain("is-off");
    go("?row=quote-q0");
    view.rerender(<Page />);
    await act(async () => { vi.advanceTimersByTime(200); });
    const hit = scrolled.find((s) => s.startsWith("fd-qt-q0:"));
    expect(hit).toBeDefined();
    expect(hit).not.toContain("is-off");
    expect(document.querySelector(".fx-flash")).not.toBeNull();
  });

  it("a repeat pick of the same result shows the row again after the owner filtered it away", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    go("?row=quote-q0");
    render(<Page />);
    await act(async () => { vi.advanceTimersByTime(200); });
    await act(async () => { filterBtn("Sent").click(); });
    expect(row("q0").className).toContain("is-off");
    scrolled = [];
    await act(async () => { window.dispatchEvent(new CustomEvent("fx:row-pick", { detail: "quote-q0" })); });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(row("q0").className).not.toContain("is-off");
    expect(scrolled.find((s) => s.startsWith("fd-qt-q0:"))).not.toContain("is-off");
  });
});

describe("See the quote and Back", () => {
  it("on a computer the focus stays where it is; on a phone it moves into the sheet (no ring)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setWidth(1280);
    render(<Page />);
    const see = screen.getByRole("button", { name: "See the quote for Harlan Realty" });
    see.focus();
    await act(async () => { see.click(); });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(document.activeElement).toBe(see);
    setWidth(390);
    const see2 = screen.getByRole("button", { name: "See the quote for Raj Patel" });
    await act(async () => { see2.click(); });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(document.activeElement?.id).toBe("fd-qt-sheet");
    expect((document.activeElement as HTMLElement).style.outlineStyle).toBe("none");
  });

  it("Back to the list gives the focus back to the row's See the quote button", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Page />);
    await act(async () => { screen.getByRole("button", { name: "See the quote for Raj Patel" }).click(); });
    await act(async () => { screen.getByRole("button", { name: "Back to the list" }).click(); });
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(document.activeElement?.id).toBe("fd-qt-v-q3");
  });
});

describe("drafts survive a page change (kept state)", () => {
  const Switch = ({ on }: { on: boolean }) => (on ? <Page /> : <p>Other page</p>);
  it("keeps the typed Build quote fields and an open edit", async () => {
    const user = userEvent.setup();
    const view = render(<Switch on />);
    const service = document.getElementById("fd-qt-sv-q1") as HTMLInputElement;
    await user.clear(service);
    await user.type(service, "Gutter fix");
    await user.type(document.getElementById("fd-qt-pr-q1") as HTMLInputElement, "950");
    await user.click(screen.getByRole("button", { name: "See the quote for Derek Olsen" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const name = document.getElementById("fd-qe-name") as HTMLInputElement;
    await user.clear(name);
    await user.type(name, "D. Olsen");
    view.rerender(<Switch on={false} />);
    view.rerender(<Switch on />);
    expect([...kept.keys()]).toEqual(["quotes"]);
    expect((document.getElementById("fd-qt-sv-q1") as HTMLInputElement).value).toBe("Gutter fix");
    expect((document.getElementById("fd-qt-pr-q1") as HTMLInputElement).value).toBe("950");
    expect((document.getElementById("fd-qe-name") as HTMLInputElement).value).toBe("D. Olsen");
  });

  it("Build quote keeps the lead's service as the row subtitle; the typed service is the line", async () => {
    const user = userEvent.setup();
    render(<Page />);
    const service = document.getElementById("fd-qt-sv-q1") as HTMLInputElement;
    await user.clear(service);
    await user.type(service, "Gutter and fascia fix");
    await user.type(document.getElementById("fd-qt-pr-q1") as HTMLInputElement, "950");
    await user.click(screen.getByRole("button", { name: "Build quote" }));
    expect(row("q1").querySelector(".fd-rsb")!.textContent).toBe("Gutter repair");
    expect(row("q1").querySelector(".fd-ram")!.textContent).toBe("$950");
    expect(document.querySelector(".fd-qln")!.textContent).toContain("Gutter and fascia fix");
  });
});

describe("row menu (design uxItems: the row's shown buttons, Lost last)", () => {
  const menuOf = (id: string) => {
    fireEvent.contextMenu(row(id), { clientX: 100, clientY: 100 });
    const items = screen.getAllByRole("menuitem").map((i) => i.textContent);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    return items;
  };
  it("lists each row type's actions", () => {
    render(<Page />);
    expect(menuOf("q0")).toEqual(["See the quote", "Approve and send"]);
    expect(menuOf("q1")).toEqual(["See the quote", "Build quote", "Or upload your own quote"]);
    expect(menuOf("q2")).toEqual(["See the quote", "Accepted", "Lost"]);
  });
  it("a menu item presses the row's own button", async () => {
    render(<Page />);
    fireEvent.contextMenu(row("q2"), { clientX: 100, clientY: 100 });
    await act(async () => { screen.getByRole("menuitem", { name: "Accepted" }).click(); await new Promise((r) => setTimeout(r, 20)); });
    expect(row("q2").textContent).toContain("Accepted. Booking link sent.");
    expect(menuOf("q2")).toEqual(["Undo", "See the quote"]);
  });
});
