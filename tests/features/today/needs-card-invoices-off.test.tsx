// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeadsResult } from "@/features/leads";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => null,
}));

import { TodayNeedsCard } from "@/features/today";

afterEach(cleanup);

const noLeads: LeadsResult = { state: "empty" };

describe("Needs you when the Invoices page is off", () => {
  it("does not report a failed check, because no check ran", () => {
    const { container } = render(<TodayNeedsCard leads={noLeads} toSend={null} invoicesLive={false} timeZone="UTC" />);
    expect(container.textContent).not.toContain("could not be checked");
  });

  it("claims only what was checked", () => {
    const { container } = render(<TodayNeedsCard leads={noLeads} toSend={null} invoicesLive={false} timeZone="UTC" />);
    expect(container.textContent).not.toMatch(/Nothing needs you/);
    expect(screen.getByText("No new leads today.")).toBeTruthy();
  });

  it("still names a real read failure when the page is on", () => {
    render(<TodayNeedsCard leads={noLeads} toSend={null} invoicesLive timeZone="UTC" />);
    expect(screen.getByText("Invoices could not be checked.")).toBeTruthy();
  });

  it("keeps Not available yet when leads cannot be read either", () => {
    render(<TodayNeedsCard leads={{ state: "unavailable" }} toSend={null} invoicesLive={false} timeZone="UTC" />);
    expect(screen.getByText("Not available yet")).toBeTruthy();
  });
});

describe("Needs you row links", () => {
  it("inherit the card's text color and have no underline", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const rule = /\.fd-nl\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toContain("color:inherit");
    expect(rule).toContain("text-decoration:none");
  });
});
