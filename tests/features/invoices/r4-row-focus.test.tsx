// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const kept = vi.hoisted(() => new Map<string, unknown>());
vi.mock("next/navigation", () => ({
  usePathname: () => "/invoices",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
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
    useBusiness: () => ({ name: "", init: "", logoUrl: null }),
    useBusinessValues: () => ({}),
  };
});

import { GestureLayer } from "@/features/app-shell";
import { InvoicesPage } from "@/features/invoices";

const row = (no: number) => document.getElementById(`fd-iv-r${no}`)!;
const Page = () => <div className="fd-app"><GestureLayer><InvoicesPage /></GestureLayer></div>;

afterEach(() => { cleanup(); kept.clear(); });

describe("R4-3 invoice rows take no focus", () => {
  it("has no tabindex on any row", () => {
    render(<Page />);
    expect(document.querySelectorAll(".fd-rw[tabindex]").length).toBe(0);
  });
  it.each([{ key: "F10", shiftKey: true }, { key: "ContextMenu", shiftKey: false }])("opens the row menu from a row button with %o", (keys) => {
    render(<Page />);
    const view = within(row(1049)).getByRole("button", { name: "View" });
    view.focus();
    fireEvent.keyDown(view, keys);
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["View", "Send invoice"]);
  });
});
