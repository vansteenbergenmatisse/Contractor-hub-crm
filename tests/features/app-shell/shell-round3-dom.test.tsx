// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useMemo, useState } from "react";

const push = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  usePathname: () => "/pipeline",
  useRouter: () => ({ push, refresh: vi.fn() }),
  useSearchParams: () => search,
}));

import { AppShell, PageAction, ROW_PICK_EVENT, buildBusiness, useRowFocus, useSearchRows, useShell, type SearchRow } from "@/features/app-shell";

const business = buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" });
const layoutRows: SearchRow[] = [
  { id: "lead-1", page: "leads", name: "Maria Alvarez", sub: "Old sub", href: "/leads" },
  { id: "quote-1", page: "quotes", name: "Marco Quinn", sub: "No price yet", href: "/quotes" },
];

const shell = (page: React.ReactNode, b = business) => render(<AppShell business={b} searchRows={layoutRows}>{page}</AppShell>);
const setupUser = () => userEvent.setup({ delay: null });
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const setWidth = (w: number) => Object.defineProperty(window, "innerWidth", { value: w, configurable: true, writable: true });
const box = (top: number, bottom: number) => () =>
  ({ left: 0, top, width: 390, height: bottom - top, right: 390, bottom, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  push.mockClear();
  search = new URLSearchParams();
  setWidth(1440);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("edge swipe follows the design", () => {
  it("with no Back on screen a swipe from the left edge does not open the menu", () => {
    setWidth(390);
    shell(<p data-testid="body">x</p>);
    const body = screen.getByTestId("body");
    const t = (type: "touchStart" | "touchMove" | "touchEnd", x: number) => {
      const list = [{ clientX: x, clientY: 300 }];
      act(() => { fireEvent[type](body, type === "touchEnd" ? { touches: [], changedTouches: list } : { touches: list, changedTouches: list }); });
    };
    t("touchStart", 10); t("touchMove", 70); t("touchMove", 140); t("touchEnd", 140);
    expect(screen.getByRole("navigation", { name: "Main menu" })).not.toHaveClass("is-open");
  });
});

describe("phone top bar title (SH1)", () => {
  it("turns glass after 2px of scroll, and shows the title only once the page heading is under the bar", () => {
    setWidth(390);
    shell(<h1 className="fd-h1">Pipeline</h1>);
    const main = document.getElementById("fd-main")!;
    const bar = document.querySelector<HTMLElement>(".fd-mtop")!;
    const h1 = screen.getByRole("heading", { name: "Pipeline" });
    bar.getBoundingClientRect = box(0, 60);
    h1.getBoundingClientRect = box(70, 110);
    Object.defineProperty(main, "scrollTop", { value: 20, configurable: true });
    fireEvent.scroll(main);
    expect(bar).toHaveClass("is-sc");
    expect(bar).not.toHaveClass("is-ttl");
    h1.getBoundingClientRect = box(20, 58);
    fireEvent.scroll(main);
    expect(bar).not.toHaveClass("is-ttl");
    h1.getBoundingClientRect = box(10, 50);
    fireEvent.scroll(main);
    expect(bar).toHaveClass("is-sc", "is-ttl");
    Object.defineProperty(main, "scrollTop", { value: 1, configurable: true });
    h1.getBoundingClientRect = box(70, 110);
    fireEvent.scroll(main);
    expect(bar).not.toHaveClass("is-sc");
    expect(bar).not.toHaveClass("is-ttl");
  });
});

describe("feedback sheet (SH2, SH3)", () => {
  it("opens on a fresh form every time, also after a page change closed it on the thank-you", async () => {
    const user = setupUser();
    shell(<p>page</p>);
    await user.click(screen.getAllByRole("button", { name: "Send feedback" })[0]);
    await wait(100);
    await user.keyboard("More colors");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("heading", { name: "Thanks, Pat." })).toBeInTheDocument();
    // closed some other way than its own buttons (here: the menu opening closes it)
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await user.click(screen.getAllByRole("button", { name: "Send feedback" })[0]);
    await wait(100);
    const field = screen.getByRole("textbox", { name: "Your feedback" });
    expect(field.closest(".fd-part")).not.toHaveClass("is-off");
    expect(field).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Thanks, Pat." }).closest(".fd-part")).toHaveClass("is-off");
  });

  it("thanks without a name when the owner is unknown", async () => {
    const user = setupUser();
    shell(<p>page</p>, buildBusiness({}));
    await user.click(screen.getAllByRole("button", { name: "Send feedback" })[0]);
    await wait(100);
    await user.keyboard("Hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByRole("heading", { name: "Thanks." })).toBeInTheDocument();
    const html = document.body.innerHTML;
    for (const bad of ["Your business", "Thanks, .", "Thanks, Owner", ">Owner<span", "undefined", "null"]) expect(html).not.toContain(bad);
  });
});

function StopSheet() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [open]);
  return <div data-testid="stop" className={`fd-cdet${open ? " is-on" : ""}`}><button type="button" className="fd-dx">Close</button></div>;
}

describe("Escape closes the sheet on top (F4)", () => {
  it("with a stop sheet open and the menu opened behind it, Escape closes the stop first, then the menu", async () => {
    const user = setupUser();
    setWidth(390);
    shell(<StopSheet />);
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    await wait(100);
    const nav = screen.getByRole("navigation", { name: "Main menu" });
    expect(nav).toHaveClass("is-open");
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("stop")).not.toHaveClass("is-on");
    expect(nav).toHaveClass("is-open");
    await user.keyboard("{Escape}");
    expect(nav).not.toHaveClass("is-open");
  });
});

function Rows({ ids }: { ids: string[] }) {
  useRowFocus(ids);
  return <ul>{ids.map((id) => <li key={id} data-row-id={id} tabIndex={-1}>{id}</li>)}</ul>;
}

describe("one #fx layer (SH5)", () => {
  it("search and the shortcut list open over a flash ring in the same #fx layer", async () => {
    const user = setupUser();
    search = new URLSearchParams("row=a");
    shell(<Rows ids={["a"]} />);
    await wait(150);
    expect(document.querySelectorAll("#fx")).toHaveLength(1);
    await user.keyboard("{Meta>}f{/Meta}");
    expect(document.querySelectorAll("#fx")).toHaveLength(1);
    const layer = document.getElementById("fx")!;
    expect(layer).toHaveClass("fd-app", "brand-scope", "fx-root");
    expect(layer.querySelector(".fx-flash")).not.toBeNull();
    expect(layer.querySelector(".fx-search")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.querySelectorAll("#fx")).toHaveLength(1);
    await user.keyboard("{Meta>}/{/Meta}");
    expect(document.querySelectorAll("#fx")).toHaveLength(1);
    expect(document.getElementById("fx")!.querySelector(".fx-help")).not.toBeNull();
    await user.keyboard("{Escape}");
    await wait(1600);
    expect(document.getElementById("fx")).toBeNull();
  });
});

describe("search field (F2)", () => {
  it("has only the field's own clear on a phone; Escape clears the text, then closes", async () => {
    const user = setupUser();
    setWidth(390);
    shell(<p>page</p>);
    await user.keyboard("{Meta>}f{/Meta}");
    const field = screen.getByRole("combobox");
    expect(field).toHaveAttribute("type", "search");
    await user.keyboard("mar");
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    await user.keyboard("{Escape}");
    expect(field).toHaveValue("");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("sign-out and tenant colors (security 1)", () => {
  it("signs out with a full page load to /sign-in", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    shell(<p>page</p>);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Sign out" })); });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out", expect.objectContaining({ method: "POST" }));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(new URL(String(assign.mock.calls[0][0])).pathname).toBe("/sign-in");
    expect(push).not.toHaveBeenCalled();
  });

  it("stays on the page and says so when the server did not end the session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    shell(<p>page</p>);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Sign out" })); });
    expect(assign).not.toHaveBeenCalled();
    expect(await screen.findByText("Could not sign out. Try again.")).toBeInTheDocument();
  });

  it("offers the same sign-out to pages through useShell", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    function SettingsLike() {
      const { signOut } = useShell();
      return <button type="button" onClick={() => void signOut()}>Leave</button>;
    }
    shell(<SettingsLike />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Leave" })); });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out", expect.objectContaining({ method: "POST" }));
    expect(new URL(String(assign.mock.calls[0][0])).pathname).toBe("/sign-in");
  });

  it("removes the live brand style and the colors Settings put on <html> when the shell goes away", () => {
    const html = document.documentElement;
    html.style.setProperty("--sub-color", "#111111");
    const view = shell(<p>page</p>);
    // what Settings' live save does
    const style = document.createElement("style");
    style.id = "settings-brand-live";
    style.textContent = ":root:root:root{--main-color:#ff0000}";
    document.head.appendChild(style);
    html.style.setProperty("--main-color", "#ff0000");
    html.style.setProperty("--sub-color", "#222222");
    view.unmount();
    expect(document.getElementById("settings-brand-live")).toBeNull();
    expect(html.style.getPropertyValue("--main-color")).toBe("");
    expect(html.style.getPropertyValue("--sub-color")).toBe("#111111");
    html.style.removeProperty("--sub-color");
  });
});

function LeadsPage({ sub }: { sub: string }) {
  const rows = useMemo<SearchRow[]>(() => [
    { id: "lead-1", page: "leads", name: "Maria Alvarez", sub, href: "/leads" },
    { id: "lead-9", page: "leads", name: "Mara Added", sub: "Added by hand", href: "/leads" },
  ], [sub]);
  useSearchRows("leads", rows);
  return <p>leads</p>;
}

describe("useSearchRows (S3)", () => {
  it("search shows a page's current rows, keeps them after the page closes, and keeps layout rows for other pages", async () => {
    const user = setupUser();
    const view = shell(<LeadsPage sub="Moved to Quoted" />);
    await user.keyboard("{Meta>}f{/Meta}");
    await user.keyboard("mar");
    expect(screen.getByText("Moved to Quoted")).toBeInTheDocument();
    expect(screen.getByText("Added by hand")).toBeInTheDocument();
    expect(screen.queryByText("Old sub")).toBeNull();
    expect(screen.getByText("No price yet")).toBeInTheDocument();
    await user.keyboard("{Escape}{Escape}");
    view.rerender(<AppShell business={business} searchRows={layoutRows}><p>other page</p></AppShell>);
    await user.keyboard("{Meta>}f{/Meta}");
    await user.keyboard("mar");
    expect(screen.getByText("Moved to Quoted")).toBeInTheDocument();
  });

  it("does nothing outside the shell", () => {
    expect(() => render(<LeadsPage sub="x" />)).not.toThrow();
  });
});

describe("ROW_PICK_EVENT", () => {
  it("is exported for pages, and fired on every pick", async () => {
    const user = setupUser();
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(ROW_PICK_EVENT, on);
    shell(<p>page</p>);
    await user.keyboard("{Meta>}f{/Meta}");
    await user.keyboard("maria{Enter}");
    await user.keyboard("{Meta>}f{/Meta}");
    await user.keyboard("maria{Enter}");
    window.removeEventListener(ROW_PICK_EVENT, on);
    expect(seen).toEqual(["lead-1", "lead-1"]);
  });
});

function ActionPage() {
  const [hidden, setHidden] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setHidden((h) => !h)}>Toggle</button>
      <PageAction hidden={hidden}><button type="button">Estimate</button></PageAction>
    </>
  );
}

describe("PageAction hidden", () => {
  it("hides the bar but keeps its buttons mounted, so focus can go back to them", async () => {
    const user = setupUser();
    shell(<ActionPage />);
    const bar = screen.getByRole("toolbar", { name: "Page actions" });
    expect(bar).not.toHaveClass("fd-hid");
    const estimate = screen.getByRole("button", { name: "Estimate" });
    await user.click(screen.getByRole("button", { name: "Toggle" }));
    expect(bar).toHaveClass("fd-hid");
    const hiddenEstimate = bar.querySelector("button");
    expect(hiddenEstimate).toBe(estimate);
    expect(estimate.closest(".fd-hid")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Toggle" }));
    expect(bar).not.toHaveClass("fd-hid");
    expect(screen.getByRole("button", { name: "Estimate" })).toBe(estimate);
  });
});
