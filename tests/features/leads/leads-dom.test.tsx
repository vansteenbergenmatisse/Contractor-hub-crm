// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

// The shell stand-in. useKeptReducer keeps state in `kept`, as the shell's page store does.
const kept = vi.hoisted(() => ({ store: new Map<string, unknown>(), keys: new Set<string>() }));
vi.mock("@/features/app-shell", async (original) => {
  const real = await original<typeof import("@/features/app-shell")>();
  const React = await import("react");
  return {
    ...real,
    PageAction: ({ children }: { children: React.ReactNode }) => <div data-testid="action">{children}</div>,
    usePushed: () => {},
    useBusiness: () => real.buildBusiness({ name: "Test Roofing Co", city: "Testville", state: "TS" }),
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

import { LeadsPage } from "@/features/leads";
import { READY } from "./fixtures";

function setUrl(search: string) {
  nav.search = search;
  window.history.replaceState(null, "", `/leads${search}`);
}

const row = (id: string) => document.querySelector<HTMLElement>(`[data-row-id="${id}"]`);
const tile = (label: string) => screen.getByText(label).previousElementSibling!.textContent;

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

describe("tiles", () => {
  it("keeps New today and This week at the loaded rows' counts when a lead is added on screen", async () => {
    const user = userEvent.setup();
    render(<LeadsPage result={READY} />);
    await user.type(screen.getByLabelText("Name"), "Pat Test");
    await user.type(screen.getByLabelText("Phone"), "6145550100");
    await user.click(screen.getByRole("button", { name: /^Add lead$/ }));
    expect(screen.getByText("Pat Test")).toBeInTheDocument();
    expect(tile("New today")).toBe("8");
    expect(tile("This week")).toBe("8");
    expect(tile("Wait on you")).toBe("4");
    // The sources panel counts the added lead, as the design does (loaded + added).
    expect(screen.getByText(/The 9 leads of this week\./)).toBeInTheDocument();
  });
});

describe("state survives moving between pages", () => {
  function Shell() {
    const [shown, setShown] = useState(true);
    return (
      <>
        <button type="button" onClick={() => setShown((s) => !s)}>switch page</button>
        {shown ? <LeadsPage result={READY} /> : <p>another page</p>}
      </>
    );
  }

  it("keeps a called lead and the filter after leaving and coming back", async () => {
    const user = userEvent.setup();
    render(<Shell />);
    await user.click(screen.getByRole("button", { name: "Call Maria Alvarez" }));
    expect(within(row("ld-1")!).getByText("Called just now")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "switch page" }));
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(within(row("ld-1")!).getByText("Called just now")).toBeInTheDocument();
    expect([...kept.keys]).toEqual(["leads"]);
  });
});

describe("?row= from the search", () => {
  it("marks every lead row with its search id", () => {
    render(<LeadsPage result={READY} />);
    for (let n = 1; n <= 8; n++) expect(row(`ld-${n}`)).not.toBeNull();
  });

  it("brings the lead into view on open", async () => {
    setUrl("?row=ld-6");
    render(<LeadsPage result={READY} />);
    await waitFor(() => expect(scrolled).toContain(row("ld-6")));
  });

  it("shows all leads again when the filter hides the lead, also with the page already open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LeadsPage result={READY} />);
    await user.click(screen.getByRole("radio", { name: /24\+/ }));
    expect(row("ld-6")).toBeNull();
    setUrl("?row=ld-6");
    rerender(<LeadsPage result={READY} />);
    await waitFor(() => expect(row("ld-6")).not.toBeNull());
    expect(screen.getByRole("radio", { name: /^All/ })).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(scrolled).toContain(row("ld-6")));
  });
});

describe("?add=1 from the shell's new-lead shortcut", () => {
  it("opens the add-lead form on open and drops the parameter", async () => {
    nav.replace.mockClear();
    setUrl("?add=1");
    render(<LeadsPage result={READY} />);
    const name = screen.getByLabelText("Name");
    await waitFor(() => expect(name).toHaveFocus());
    expect(scrolled).toContain(name);
    expect(nav.replace).toHaveBeenCalledWith("/leads");
  });

  it("opens the add-lead form when ?add=1 arrives with Leads already open, every time", async () => {
    nav.replace.mockClear();
    const { rerender } = render(<LeadsPage result={READY} />);
    const name = screen.getByLabelText("Name");
    expect(name).not.toHaveFocus();
    expect(nav.replace).not.toHaveBeenCalled();

    setUrl("?add=1");
    rerender(<LeadsPage result={READY} />);
    await waitFor(() => expect(name).toHaveFocus());
    expect(nav.replace).toHaveBeenCalledWith("/leads");

    // The parameter is dropped, the owner moves on, then presses the shortcut again.
    name.blur();
    setUrl("");
    rerender(<LeadsPage result={READY} />);
    expect(name).not.toHaveFocus();
    setUrl("?add=1");
    rerender(<LeadsPage result={READY} />);
    await waitFor(() => expect(name).toHaveFocus());
    expect(nav.replace).toHaveBeenCalledTimes(2);
  });
});
