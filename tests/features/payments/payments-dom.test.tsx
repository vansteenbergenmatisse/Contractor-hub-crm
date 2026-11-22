// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/payments",
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AppShell, buildBusiness } from "@/features/app-shell";
import { PaymentsPage } from "@/features/payments";

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
});
