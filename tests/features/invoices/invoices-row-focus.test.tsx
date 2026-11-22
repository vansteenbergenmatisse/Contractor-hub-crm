// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The URL the page sees. A search result on the same route changes it without remounting the page.
const nav = vi.hoisted(() => ({ search: "" }));
// Stands in for the shell's page-state store (it lives in the signed-in layout and outlives a page).
const kept = vi.hoisted(() => new Map<string, unknown>());
const timer = vi.hoisted(() => ({ calls: [] as Array<{ name: string }> }));
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
    useShell: () => ({ sendTimer: (req: { name: string }) => { timer.calls.push(req); }, askReason: vi.fn(), setPushed: vi.fn(), setAction: vi.fn() }),
    usePushed: () => {},
    useBusiness: () => ({ name: "Your business", init: "YB", logoUrl: null }),
    useBusinessValues: () => ({}),
  };
});

import { InvoicesPage } from "@/features/invoices";

const go = (search: string) => {
  nav.search = search;
  window.history.replaceState(null, "", `/invoices${search}`);
};
const row = (no: number) => document.getElementById(`fd-iv-r${no}`)!;
const filter = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(".fd-flb")).find((b) => b.textContent === label)!;

afterEach(() => {
  cleanup();
  kept.clear();
  go("");
  vi.useRealTimers();
});

describe("?row= on the Invoices page", () => {
  it("clears a filter that hides the linked row, on open and when the URL changes while the page is open", async () => {
    vi.useFakeTimers();
    const view = render(<InvoicesPage />);
    await act(async () => { filter("Paid").click(); });
    expect(row(1045).className).toContain("is-off");
    go("?row=invoice-1045");
    view.rerender(<InvoicesPage />);
    await act(async () => { vi.runAllTimers(); });
    expect(row(1045).className).not.toContain("is-off");
    expect(filter("All").getAttribute("aria-pressed")).toBe("true");
  });

  it("honours ?row= when the page opens with it", async () => {
    vi.useFakeTimers();
    go("?row=invoice-1042");
    render(<div className="fd-app"><InvoicesPage /></div>);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(document.querySelector(".fx-flash")).not.toBeNull();
  });
});

describe("Send invoice", () => {
  const sendOf = (no: number) => Array.from(row(no).querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Send invoice")!;
  it("never opens the send timer for a draft that misses a field, and does for a ready invoice", async () => {
    timer.calls.length = 0;
    render(<InvoicesPage />);
    for (const no of [1048, 1047, 1046]) await act(async () => { sendOf(no).click(); });
    expect(timer.calls).toHaveLength(0);
    await act(async () => { sendOf(1049).click(); });
    expect(timer.calls.map((c) => c.name)).toEqual(["Hilliard Storage"]);
  });
});

describe("Invoices state survives moving between pages", () => {
  it("an invoice marked paid is still paid after the page unmounts and comes back", async () => {
    const user = userEvent.setup();
    const Page = ({ on }: { on: boolean }) => (on ? <InvoicesPage /> : <p>Other page</p>);
    const view = render(<Page on />);
    const paid = Array.from(row(1045).querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Mark paid")!;
    await user.click(paid);
    expect(row(1045).textContent).toContain("Paid just now");
    view.rerender(<Page on={false} />);
    expect(document.getElementById("fd-iv-r1045")).toBeNull();
    expect(kept.has("invoices")).toBe(true);
    view.rerender(<Page on />);
    expect(row(1045).textContent).toContain("Paid just now");
  });
});
