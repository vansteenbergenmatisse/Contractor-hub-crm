// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const kept = vi.hoisted(() => new Map<string, unknown>());
vi.mock("next/navigation", () => ({
  usePathname: () => "/quotes",
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
    useBusinessValues: () => ({ business_name: "", business_address: "", business_phone_number: "", business_email: "", business_hours: "", business_website_url: "" }),
    useBusiness: () => ({ name: "", init: "" }),
  };
});

import { GestureLayer } from "@/features/app-shell";
import { QuotesPage } from "@/features/quotes";

const row = (id: string) => document.getElementById(`fd-qt-${id}`)!;
const Page = () => <div className="fd-app"><GestureLayer><QuotesPage /></GestureLayer></div>;

afterEach(() => { cleanup(); kept.clear(); });

describe("R4-3 quote rows take no focus", () => {
  it("has no tabindex on any row", () => {
    render(<Page />);
    expect(document.querySelectorAll(".fd-lst .fd-rw[tabindex]").length).toBe(0);
  });
  it.each([{ key: "F10", shiftKey: true }, { key: "ContextMenu", shiftKey: false }])("opens the row menu from a row button with %o", (keys) => {
    render(<Page />);
    const see = within(row("q2")).getByRole("button", { name: "See the quote" });
    see.focus();
    fireEvent.keyDown(see, keys);
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["See the quote", "Accepted", "Lost"]);
  });
});

describe("R4-4 upload attaches the design's sample file at once", () => {
  it("has no file picker", () => {
    render(<Page />);
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
  it("the row link attaches quote-<name>.pdf and the quote becomes ready", async () => {
    render(<Page />);
    await act(async () => { within(row("q1")).getByRole("button", { name: "Or upload your own quote" }).click(); });
    expect(document.querySelector(".fd-side2")!.textContent).toContain("quote-priya-shah.pdf");
    expect(row("q1").textContent).toContain("In your file");
  });
  it("the sheet link attaches the file for the selected quote", async () => {
    render(<Page />);
    const sheet = document.querySelector<HTMLElement>(".fd-side2")!;
    await act(async () => { within(sheet).getByRole("button", { name: "Upload your own quote" }).click(); });
    expect(sheet.textContent).toContain("quote-derek-olsen.pdf");
  });
});

describe("R4-11 quote row buttons use their visible words", () => {
  it("adds no aria-label to the row's buttons", () => {
    render(<Page />);
    expect(document.querySelectorAll(".fd-lst .fd-rac button[aria-label]").length).toBe(0);
    expect(within(row("q2")).getByRole("button", { name: "Accepted" })).toBeTruthy();
    expect(within(row("q2")).getByRole("button", { name: "Lost" })).toBeTruthy();
    expect(within(row("q0")).getByRole("button", { name: "Approve and send" })).toBeTruthy();
  });
});
