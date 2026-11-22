// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The URL the page sees. A search result on the same route changes it without remounting the page.
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
    useBusiness: () => ({ name: "Your business", init: "YB" }),
  };
});

import { QuotesPage } from "@/features/quotes";

const go = (search: string) => {
  nav.search = search;
  window.history.replaceState(null, "", `/quotes${search}`);
};
const row = (id: string) => document.getElementById(`fd-qt-${id}`)!;

afterEach(() => {
  cleanup();
  kept.clear();
  go("");
  vi.useRealTimers();
});

describe("?row= on the Quotes page", () => {
  // Design `uxOpen`: a search result only shows and flashes its row; it opens no sheet and selects nothing.
  it("a search link shows the row without opening its sheet or selecting it, also when the URL changes while open", async () => {
    vi.useFakeTimers();
    const view = render(<QuotesPage />);
    go("?row=quote-q3");
    view.rerender(<QuotesPage />);
    await act(async () => { vi.runAllTimers(); });
    expect(document.querySelector(".fd-dv")!.className).not.toContain("is-doc");
    expect(row("q0").className).toContain("is-sel");
    expect(row("q3").className).not.toContain("is-sel");
  });

  it("a Pipeline See quote link (&open=sheet) opens that quote's sheet; Add price (&open=price) selects it on the list", async () => {
    vi.useFakeTimers();
    const view = render(<QuotesPage />);
    go("?row=quote-q3&open=sheet");
    view.rerender(<QuotesPage />);
    await act(async () => { vi.runAllTimers(); });
    expect(row("q3").className).toContain("is-sel");
    expect(document.querySelector(".fd-dv")!.className).toContain("is-doc");
    go("?row=quote-q1&open=price");
    view.rerender(<QuotesPage />);
    await act(async () => { vi.runAllTimers(); });
    expect(row("q1").className).toContain("is-sel");
    expect(document.querySelector(".fd-dv")!.className).not.toContain("is-doc");
    expect(document.activeElement?.id).toBe("fd-qt-pr-q1");
  });

  it("clears a filter that hides the linked row, as the design does", async () => {
    vi.useFakeTimers();
    const view = render(<QuotesPage />);
    await act(async () => { row("q0").ownerDocument.querySelector<HTMLButtonElement>('button[aria-label^="Sent"]')!.click(); });
    expect(row("q0").className).toContain("is-off");
    go("?row=quote-q0");
    view.rerender(<QuotesPage />);
    await act(async () => { vi.runAllTimers(); });
    expect(row("q0").className).not.toContain("is-off");
  });

  it("lays the design's flash ring over the linked row", async () => {
    vi.useFakeTimers();
    const view = render(<div className="fd-app"><QuotesPage /></div>);
    go("?row=quote-q2");
    view.rerender(<div className="fd-app"><QuotesPage /></div>);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(document.querySelector(".fx-flash")).not.toBeNull();
  });
});

describe("Quotes state survives moving between pages", () => {
  it("a quote marked accepted is still accepted after the page unmounts and comes back", async () => {
    const user = userEvent.setup();
    const Page = ({ on }: { on: boolean }) => (on ? <QuotesPage /> : <p>Other page</p>);
    const view = render(<Page on />);
    await user.click(within(row("q2")).getByRole("button", { name: "Accepted" }));
    expect(row("q2").textContent).toContain("Accepted. Booking link sent.");
    view.rerender(<Page on={false} />);
    expect(document.getElementById("fd-qt-q2")).toBeNull();
    expect([...kept.keys()]).toEqual(["quotes"]);
    view.rerender(<Page on />);
    expect(row("q2").textContent).toContain("Accepted. Booking link sent.");
  });
});
