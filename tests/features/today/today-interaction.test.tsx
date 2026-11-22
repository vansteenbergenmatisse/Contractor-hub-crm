// @vitest-environment happy-dom
import { existsSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/app-shell", async (original) => ({
  ...(await original<typeof import("@/features/app-shell")>()),
  useShell: () => ({ sendTimer: vi.fn(), askReason: vi.fn(), setInboxCount: vi.fn(), setAction: vi.fn(), setPushed: vi.fn(), openSearch: vi.fn(), openFeedback: vi.fn() }),
  PageAction: () => null,
}));

import { PageStateProvider } from "@/features/app-shell";
import { buildMockInvoices, chipFor } from "@/features/invoices";
import { MoneyCards, TodayPage } from "@/features/today";

function Pages() {
  const [on, setOn] = useState(true);
  return (
    <PageStateProvider>
      <button type="button" onClick={() => setOn((v) => !v)}>switch page</button>
      {on ? <TodayPage ownerFirst="Pat" /> : <p>other page</p>}
    </PageStateProvider>
  );
}

describe("Today: state survives moving between pages", () => {
  it("keeps a done to-do, its Undo and the count after leaving and coming back", async () => {
    const user = userEvent.setup();
    render(<Pages />);
    const maria = Array.from(document.querySelectorAll<HTMLElement>("li.fd-row")).find((li) => li.textContent?.includes("Maria Alvarez")) as HTMLElement;
    await user.click(within(maria).getByRole("button", { name: "Call" }));
    expect(screen.getByText("Called. The follow-up texts stop.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(screen.getByText("other page")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(screen.getByText("Called. The follow-up texts stop.")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/5\sthings/);
  });
});

describe("Today: wording follows the design", () => {
  it("labels the pipeline tile as the design does", () => {
    render(<TodayPage ownerFirst="Pat" />);
    expect(screen.getByRole("button", { name: "Jobs this week: 6, 1 today. Open the job stages in the pipeline" })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("None left today");
  });
});

describe("Today: Money owed agrees with the Invoices page", () => {
  it("shows Paul Ortega's due day from the same invoice data as Invoices", () => {
    const now = new Date();
    const paul = buildMockInvoices(now).find((i) => i.no === 1045);
    expect(paul).toBeDefined();
    const expected = chipFor(paul!, now).text;
    render(<MoneyCards />);
    const row = screen.getByText("Paul Ortega").closest("li") as HTMLElement;
    expect(row).toHaveTextContent(expected);
    expect(row).toHaveTextContent("$9,500");
  });
});

describe("Today: file names", () => {
  it("names the hook file in kebab-case", () => {
    expect(existsSync(join(process.cwd(), "src/features/today/hooks/use-today.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "src/features/today/hooks/useToday.ts"))).toBe(false);
  });
});
