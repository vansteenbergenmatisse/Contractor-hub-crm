// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeadsResult } from "@/features/leads";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => null,
}));

vi.mock("@/features/app-shell", async (original) => ({
  ...(await original<typeof import("@/features/app-shell")>()),
  useShell: () => ({ sendTimer: vi.fn(), askReason: vi.fn(), setInboxCount: vi.fn(), setAction: vi.fn(), setPushed: vi.fn(), openSearch: vi.fn(), openFeedback: vi.fn() }),
  PageAction: () => null,
}));

import { TodayLeadsCard, TodayNeedsCard, TodayPage } from "@/features/today";

afterEach(cleanup);

const noLeads: LeadsResult = { state: "empty" };

describe("Today with a real Needs you card", () => {
  const html = renderToStaticMarkup(
    <TodayPage
      ownerFirst="Pat"
      needsCard={<TodayNeedsCard leads={noLeads} toSend={0} owed={0} timeZone="UTC" />}
      leadsCard={<TodayLeadsCard result={noLeads} timeZone="UTC" index={7} />}
    />,
  );
  const at = (needle: string) => {
    const index = html.indexOf(needle);
    expect(index, needle).toBeGreaterThanOrEqual(0);
    return index;
  };
  const delay = (id: string) => html.slice(html.lastIndexOf("<section", at(`id="${id}"`))).match(/--i:\s*(\d+)/)?.[1];

  it("follows the design order: Needs you, calendar, leads, money", () => {
    const order = [at('id="fd-need-h"'), at('id="fd-cal-h"'), at('id="fd-lead-h"'), at('aria-label="Money"')];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("runs the entrance from top to bottom", () => {
    expect([delay("fd-need-h"), delay("fd-cal-h"), delay("fd-lead-h")]).toEqual(["5", "6", "7"]);
  });
});

describe("Needs you and invoices that are owed", () => {
  it("lists owed invoices instead of an all-clear", () => {
    render(<TodayNeedsCard leads={noLeads} toSend={0} owed={3} timeZone="UTC" />);
    expect(screen.getByRole("link", { name: "3 invoices owed" })).toHaveAttribute("href", "/invoices");
    expect(screen.queryByText(/Nothing needs you/)).toBeNull();
  });

  it("shows invoices to send and owed side by side with no key warning", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<TodayNeedsCard leads={noLeads} toSend={2} owed={1} timeZone="UTC" />);
    expect(screen.getByRole("link", { name: "2 invoices to send" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "1 invoice owed" })).toBeTruthy();
    expect(spy.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    spy.mockRestore();
  });

  it("gives no all-clear when the owed count is unknown", () => {
    render(<TodayNeedsCard leads={noLeads} toSend={0} owed={null} timeZone="UTC" />);
    expect(screen.getByText("Money owed could not be checked.")).toBeTruthy();
    expect(screen.queryByText(/Nothing needs you/)).toBeNull();
  });

  it("does not show a partial owed count when the invoice read failed", () => {
    render(<TodayNeedsCard leads={noLeads} toSend={null} owed={2} timeZone="UTC" />);
    expect(screen.queryByRole("link", { name: /owed/ })).toBeNull();
    expect(screen.getByText("Invoices could not be checked.")).toBeTruthy();
  });

  it("says nothing needs you when leads, drafts and owed are all proven zero", () => {
    render(<TodayNeedsCard leads={noLeads} toSend={0} owed={0} timeZone="UTC" />);
    expect(screen.getByText("Nothing needs you right now.")).toBeTruthy();
  });

  it("reports no owed failure while the Invoices page is off", () => {
    const { container } = render(<TodayNeedsCard leads={noLeads} toSend={null} owed={null} invoicesLive={false} timeZone="UTC" />);
    expect(container.textContent).not.toContain("could not be checked");
    expect(screen.getByText("No new leads today.")).toBeTruthy();
  });
});
