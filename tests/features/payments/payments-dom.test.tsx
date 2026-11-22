// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/payments",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AppShell, GestureLayer, buildBusiness } from "@/features/app-shell";
import { PaymentsPage } from "@/features/payments";
import { markSentPatch, useInvoicesKept } from "@/features/invoices";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

const rowOf = (name: string) => screen.getByText(name).closest<HTMLElement>(".fd-rw")!;

describe("Payments due in the browser", () => {
  it("puts the visible words first in every button's accessible name (WCAG 2.5.3)", () => {
    render(<PaymentsPage />);
    expect(screen.getByRole("button", { name: "Remind now, Bright Daycare" })).toHaveTextContent("Remind now");
    expect(screen.getByRole("button", { name: "Mark paid, Grace Whitfield" })).toHaveTextContent("Mark paid");
    for (const b of screen.getAllByRole("button")) {
      const name = b.getAttribute("aria-label");
      const text = (b.textContent ?? "").trim();
      if (name && text) expect(name.startsWith(text), `${name} / ${text}`).toBe(true);
    }
  });

  it("Remind now replaces the history line once; pressing again adds nothing and offers no Undo", async () => {
    const user = userEvent.setup();
    render(<PaymentsPage />);
    const remind = screen.getByRole("button", { name: "Remind now, Grace Whitfield" });
    await user.click(remind);
    await user.click(remind);
    const row = rowOf("Grace Whitfield");
    expect(within(row).getAllByText("Reminder sent just now")).toHaveLength(1);
    expect(within(row).queryByText(/A reminder went out on day 3/)).toBeNull();
    expect(within(row).queryByRole("button", { name: /Undo/ })).toBeNull();
  });

  it("Mark paid offers Undo, and Undo brings the invoice back", async () => {
    const user = userEvent.setup();
    render(<PaymentsPage />);
    await user.click(screen.getByRole("button", { name: "Mark paid, Paul Ortega" }));
    const row = rowOf("Paul Ortega");
    expect(within(row).getByText("Paid just now")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Undo for Paul Ortega" }));
    expect(within(row).queryByText("Paid just now")).toBeNull();
    expect(screen.getByRole("button", { name: "Mark paid, Paul Ortega" })).toBeInTheDocument();
  });

  it("keeps a paid invoice and a reminder when the owner leaves the page and comes back", async () => {
    const user = userEvent.setup();
    function Shell() {
      const [on, setOn] = useState(true);
      return (
        <AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}>
          <button type="button" onClick={() => setOn((x) => !x)}>switch page</button>
          {on ? <PaymentsPage /> : <p>other page</p>}
        </AppShell>
      );
    }
    render(<Shell />);
    await user.click(screen.getByRole("button", { name: "Mark paid, Bright Daycare" }));
    await user.click(screen.getByRole("button", { name: "Remind now, Grace Whitfield" }));
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(screen.getByText("other page")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(within(rowOf("Bright Daycare")).getByText("Paid just now")).toBeInTheDocument();
    expect(within(rowOf("Grace Whitfield")).getByText("Reminder sent just now")).toBeInTheDocument();
  });

  it("brings the ?row= invoice into view with the design's flash", async () => {
    vi.useFakeTimers();
    try {
      window.history.replaceState(null, "", "/payments?row=payments-inv-1044");
      const scroll = vi.fn();
      HTMLElement.prototype.scrollIntoView = scroll;
      render(<PaymentsPage />);
      expect(scroll).toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(document.querySelector(".fx-flash")).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("⌘Z / Ctrl Z undoes Mark paid, as the on-screen Undo does, and does nothing while no row is paid", async () => {
    const user = userEvent.setup();
    render(
      <AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}>
        <PaymentsPage />
      </AppShell>,
    );
    await user.keyboard("{Control>}z{/Control}");
    expect(screen.getAllByRole("button", { name: /^Mark paid, / })).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Mark paid, Grace Whitfield" }));
    expect(within(rowOf("Grace Whitfield")).getByText("Paid just now")).toBeInTheDocument();
    await user.keyboard("{Control>}z{/Control}");
    expect(within(rowOf("Grace Whitfield")).queryByText("Paid just now")).toBeNull();
    expect(screen.getByRole("button", { name: "Mark paid, Grace Whitfield" })).toBeInTheDocument();
  });

  it("a row's menu holds the design's actions: Remind now and Mark paid; a paid row offers only Undo", async () => {
    render(<GestureLayer><PaymentsPage /></GestureLayer>);
    const row = rowOf("Grace Whitfield");
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
    const menu = screen.getByRole("menu", { name: "Actions for Grace Whitfield" });
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Remind now", "Mark paid"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Mark paid" }));
    await waitFor(() => expect(within(rowOf("Grace Whitfield")).getByText("Paid just now")).toBeInTheDocument());
    fireEvent.contextMenu(rowOf("Grace Whitfield"), { clientX: 100, clientY: 100 });
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Undo"]);
    fireEvent.click(items[0]);
    await waitFor(() => expect(within(rowOf("Grace Whitfield")).queryByText("Paid just now")).toBeNull());
  });

  it("swipe left marks the invoice paid and swipe right sends a reminder (phone)", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const width = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true, writable: true });
    try {
      render(<GestureLayer><PaymentsPage /></GestureLayer>);
      const drag = (el: HTMLElement, dx: number) => {
        el.getBoundingClientRect = () => ({ left: 0, top: 100, width: 390, height: 80, right: 390, bottom: 180, x: 0, y: 100, toJSON: () => ({}) }) as DOMRect;
        const at = (x: number) => ({ touches: [{ clientX: x, clientY: 140 }], changedTouches: [{ clientX: x, clientY: 140 }] });
        act(() => { fireEvent.touchStart(el, at(200)); });
        act(() => { fireEvent.touchMove(el, at(200 + dx / 2)); });
        act(() => { fireEvent.touchMove(el, at(200 + dx)); });
        act(() => { fireEvent.touchEnd(el, { touches: [], changedTouches: [{ clientX: 200 + dx, clientY: 140 }] }); });
      };
      drag(rowOf("Paul Ortega"), -180);
      expect(within(rowOf("Paul Ortega")).getByText("Paid just now")).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(1000); });
      drag(rowOf("Grace Whitfield"), 180);
      expect(within(rowOf("Grace Whitfield")).getByText("Reminder sent just now")).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
      vi.useRealTimers();
    }
  });

  it("shows the Not available yet chip inside the banner sentence, as Settings says it", () => {
    render(<PaymentsPage />);
    const banner = screen.getByText(/A paid invoice does not mark itself paid yet\./);
    expect(banner.tagName).toBe("SPAN");
    expect(within(banner).getByText("Not available yet")).toHaveClass("fd-chip", "is-plain");
    expect(banner.previousElementSibling?.tagName.toLowerCase()).toBe("svg");
  });

  it("reads the live Invoices state: Mark paid here pays the invoice there, and an invoice sent there shows here", async () => {
    const user = userEvent.setup();
    let invoices: ReturnType<typeof useInvoicesKept> | null = null;
    function Probe() {
      invoices = useInvoicesKept();
      return null;
    }
    render(
      <AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}>
        <Probe />
        <PaymentsPage />
      </AppShell>,
    );
    await user.click(screen.getByRole("button", { name: "Mark paid, Grace Whitfield" }));
    expect(invoices![0].invoices.find((i) => i.no === 1044)!.st).toBe("paid");
    await user.click(screen.getByRole("button", { name: "Undo for Grace Whitfield" }));
    expect(invoices![0].invoices.find((i) => i.no === 1044)!.st).toBe("sent");
    expect(screen.queryByText("Hilliard Storage")).toBeNull();
    act(() => invoices![1](markSentPatch(1049, new Date())));
    expect(within(rowOf("Hilliard Storage")).getByText(/^Due /)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remind now, Hilliard Storage" }));
    expect(within(rowOf("Hilliard Storage")).getByText("Reminder sent just now")).toBeInTheDocument();
  });
});
