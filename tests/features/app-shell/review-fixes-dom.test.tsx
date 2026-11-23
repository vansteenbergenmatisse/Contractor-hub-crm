// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Suspense, use, useEffect, useState } from "react";

const nav = vi.hoisted(() => ({ path: "/today", push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useRouter: () => ({ push: nav.push, refresh: nav.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AppShell, buildBusiness, helpRows, useSearchRows, type SearchRow } from "@/features/app-shell";

const business = buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" });
const lead = (id: string, name: string): SearchRow => ({ id, page: "leads", name, sub: "", href: "/leads" });
const OLD = [lead("a", "Olive Older")];
const FRESH = [lead("a", "Olive Older"), lead("b", "Nina Newer")];
const OWN = [lead("x", "Hana Handadded"), lead("a", "Olive Older")];
const NONE: SearchRow[] = [];

function Seed({ rows }: { rows: readonly SearchRow[] }) {
  useSearchRows("leads", rows, { seed: true });
  return null;
}
function Own({ rows }: { rows: readonly SearchRow[] }) {
  useSearchRows("leads", rows);
  return null;
}
const frame = (child: React.ReactNode, key = "u1") => <AppShell key={key} business={business} searchRows={[]}>{child}</AppShell>;
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const hits = async (term: string) => {
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await settle();
  fireEvent.change(screen.getByRole("combobox"), { target: { value: term } });
  const count = screen.queryAllByRole("option").length;
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await settle();
  return count;
};
const touch = (el: Element, type: "touchStart" | "touchMove" | "touchEnd", y: number) => {
  const list = [{ clientX: 200, clientY: y }];
  act(() => { fireEvent[type](el, type === "touchEnd" ? { touches: [], changedTouches: list } : { touches: list, changedTouches: list }); });
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  nav.path = "/today";
  nav.push.mockReset();
  nav.refresh.mockReset();
  Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true, writable: true });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("search rows: seed against the page's own rows", () => {
  it("a newer seed replaces the rows Leads handed in earlier", async () => {
    const view = render(frame(<Seed rows={OLD} />));
    view.rerender(frame(<Own rows={OLD} />));
    view.rerender(frame(<Seed rows={FRESH} />));
    expect(await hits("Nina")).toBe(1);
  });

  it("returning to Today with the same seed keeps the page's own rows", async () => {
    const view = render(frame(<Seed rows={OLD} />));
    view.rerender(frame(<Own rows={OWN} />));
    view.rerender(frame(<Seed rows={OLD} />));
    expect(await hits("Hana")).toBe(1);
  });

  it("an empty seed (leads unavailable) does not wipe rows search already has", async () => {
    const view = render(frame(<Seed rows={OLD} />));
    view.rerender(frame(<Seed rows={NONE} />));
    expect(await hits("Olive")).toBe(1);
  });

  it("the page's own rows still replace a seed", async () => {
    const view = render(frame(<Seed rows={OLD} />));
    view.rerender(frame(<Own rows={OWN} />));
    expect(await hits("Hana")).toBe(1);
  });

  it("no seed or page rows survive a user or tenant switch", async () => {
    const view = render(frame(<Seed rows={FRESH} />, "user-1:tenant-1"));
    expect(await hits("Nina")).toBe(1);
    view.rerender(frame(<p>next</p>, "user-2:tenant-2"));
    expect(await hits("Nina")).toBe(0);
  });
});

describe("navigation while a page is loading", () => {
  const never = new Promise<void>(() => {});
  const hold: { set?: (p: Promise<void>) => void } = {};
  function Slow() {
    const [wait, setWait] = useState<Promise<void> | null>(null);
    useEffect(() => { hold.set = setWait; }, []);
    if (wait) use(wait);
    return <p>Today body</p>;
  }

  it("tapping the current tab during a load pushes it, so the last tap wins", async () => {
    nav.push.mockImplementation(() => hold.set?.(never));
    render(frame(<Suspense fallback={null}><Slow /></Suspense>));
    const tabs = within(screen.getByRole("navigation", { name: "Main pages" }));
    const tab = (name: RegExp) => tabs.getByRole("button", { name });
    fireEvent.click(tab(/Leads/));
    await settle();
    expect(nav.push).toHaveBeenLastCalledWith("/leads");
    expect(tab(/Leads/)).toHaveClass("is-on");
    fireEvent.click(tab(/Today/));
    await settle();
    expect(nav.push).toHaveBeenCalledTimes(2);
    expect(nav.push).toHaveBeenLastCalledWith("/");
    expect(tab(/Today/)).toHaveClass("is-on");
    expect(tab(/Leads/)).not.toHaveClass("is-on");
  });

  it("tapping the open tab with nothing loading does not navigate", async () => {
    render(frame(<p>Today body</p>));
    fireEvent.click(within(screen.getByRole("navigation", { name: "Main pages" })).getByRole("button", { name: /Today/ }));
    await settle();
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("pull to refresh wording and scope", () => {
  const pull = (el: Element) => {
    touch(el, "touchStart", 100);
    touch(el, "touchMove", 170);
    touch(el, "touchMove", 250);
    touch(el, "touchEnd", 250);
  };

  it("says the neutral Refreshed after a refresh settles", async () => {
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true, writable: true });
    render(frame(<p data-testid="body">Body</p>));
    pull(screen.getByTestId("body"));
    await settle();
    expect(nav.refresh).toHaveBeenCalledOnce();
    expect(document.querySelector(".fx-pull")).toHaveTextContent("Refreshed");
    expect(document.querySelector(".fx-pull")).not.toHaveTextContent("Updated");
  });

  it("is not offered on Settings", async () => {
    nav.path = "/settings";
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true, writable: true });
    render(frame(<p data-testid="body">Body</p>));
    pull(screen.getByTestId("body"));
    await settle();
    expect(nav.refresh).not.toHaveBeenCalled();
    expect(document.querySelector(".fx-pull.is-on")).toBeNull();
  });
});

describe("copy matches what exists today", () => {
  it("shortcut help promises only a search of leads", () => {
    const text = helpRows(true).map(([, label]) => label).join(" ");
    expect(text).toContain("Search leads");
    expect(text).not.toMatch(/quotes|invoices/i);
  });

  it("the disabled feedback field has no placeholder", () => {
    render(frame(<p>Body</p>));
    const box = document.querySelector("#fd-fb-text");
    expect(box).toBeDisabled();
    expect(box).not.toHaveAttribute("placeholder");
  });

  it("search with no rows says there are no leads yet", async () => {
    render(frame(<p>Body</p>));
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await settle();
    expect(screen.getByText("No leads to search yet.")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "zzz" } });
    expect(screen.getByText("No leads to search yet.")).toBeInTheDocument();
  });
});
