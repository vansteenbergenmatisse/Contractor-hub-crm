// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/invoices",
  useRouter: () => ({ push: vi.fn(), refresh }),
  useSearchParams: () => null,
}));

import { AppShell, buildBusiness } from "@/features/app-shell";
import { InvoicesLivePage, InvoicesSkeleton, loadInvoices, type InvoicesResult, type LiveInvoiceRow } from "@/features/invoices";
import { PaymentsLivePage, PaymentsSkeleton, loadPayments, type PaymentsResult } from "@/features/payments";

// All values are fake.
const row = (over: Partial<LiveInvoiceRow> = {}): LiveInvoiceRow => ({
  id: "i1", status: "sent", liveMode: true, name: "Spring cleanup", number: "19", contactName: "Pat Test", currency: "USD",
  issueDate: "2026-03-01", dueDate: "2026-03-15", total: 999, amountDue: 999, amountPaid: 0, ...over,
});
const invoices = (rows: LiveInvoiceRow[], complete = true) => loadInvoices("t", async () => ({ ok: true as const, rows, expected: rows.length, dropped: 0, complete }));
const payments = (rows: LiveInvoiceRow[], complete = true) => loadPayments("t", {
  invoices: async () => ({ ok: true as const, rows, expected: rows.length, dropped: 0, complete }),
  transactions: async () => ({ ok: true as const, rows: [{ id: "t1", contactName: "Sam Test", currency: "USD", amount: 100, amountRefunded: 0, status: "succeeded", liveMode: true, createdAt: "2026-03-02T10:00:00.000Z" }], expected: 1, dropped: 0, complete: true }),
});
const showI = (r: InvoicesResult) => render(<AppShell business={buildBusiness({})} searchRows={[]}><InvoicesLivePage result={r} /></AppShell>);
const showP = (r: PaymentsResult) => render(<AppShell business={buildBusiness({})} searchRows={[]}><PaymentsLivePage result={r} /></AppShell>);

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

describe("InvoicesLivePage", () => {
  it("shows the real invoice and its proven total, with no sample row", async () => {
    const { container } = showI(await invoices([row()]));
    expect(screen.getByRole("heading", { level: 1, name: "Invoices" })).toBeTruthy();
    expect(container.textContent).toContain("Pat Test");
    expect(container.querySelector(".fd-sum")?.textContent).toContain("USD 999");
    expect(container.textContent).not.toMatch(/\$/);
  });

  it("shows no total on an incomplete read and says why", async () => {
    const { container } = showI(await invoices([row()], false));
    expect(container.querySelector(".fd-sum")).toBeNull();
    expect(container.textContent).toContain("no total is shown");
  });

  it("keeps every send and mark-paid control disabled", async () => {
    showI(await invoices([row()]));
    for (const name of [/Send invoice/, /Mark paid/]) {
      const button = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    }
    expect(screen.queryByRole("button", { name: /void|charge/i })).toBeNull();
  });

  it("filters rows on screen only", async () => {
    const { container } = showI(await invoices([row(), row({ id: "p", status: "paid", amountDue: 0, contactName: "Paid Person" })]));
    fireEvent.click(screen.getByRole("button", { name: "Paid" }));
    expect(container.textContent).toContain("Paid Person");
    expect(container.textContent).not.toContain("Pat Test");
  });

  it.each([
    ["reconnect", "connection needs attention", false],
    ["unavailable", "can't load right now", true],
  ] as const)("shows the %s state", (state, copy, retry) => {
    const { container } = showI({ state });
    expect(container.textContent).toContain(copy);
    expect(screen.queryByRole("button", { name: "Try again" }) !== null).toBe(retry);
  });

  it("retries by refreshing, and has an empty state and a skeleton", () => {
    showI({ state: "unavailable" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalled();
    cleanup();
    expect(showI({ state: "empty" }).container.textContent).toContain("No invoices yet");
    cleanup();
    expect(render(<InvoicesSkeleton />).container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});

describe("PaymentsLivePage", () => {
  it("shows who owes, the proven total and the recorded payments", async () => {
    const { container } = showP(await payments([row()]));
    expect(screen.getByRole("heading", { level: 1, name: "Payments due" })).toBeTruthy();
    expect(container.textContent).toContain("Pat Test");
    expect(container.textContent).toContain("Sam Test");
    expect(container.querySelector(".fd-sum")?.textContent).toContain("USD 999");
    expect(container.textContent).not.toMatch(/\d+ late|Paid today|\$/);
  });

  it("keeps every remind and mark-paid control disabled", async () => {
    showP(await payments([row()]));
    for (const name of [/Remind now/, /Mark paid/]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("shows no total and no 'nobody owes' when it cannot prove them", async () => {
    const { container } = showP(await payments([row(), row({ id: "b", currency: "CAD" })]));
    expect(container.querySelector(".fd-sum")).toBeNull();
    expect(container.textContent).toContain("no total is shown");
    expect(container.textContent).not.toContain("Nobody owes");
    cleanup();
    expect(showP(await payments([row({ status: null })])).container.textContent).not.toContain("Nobody owes");
  });

  it("has reconnect, unavailable and empty states and a skeleton", () => {
    expect(showP({ state: "reconnect" }).container.textContent).toContain("connection needs attention");
    cleanup();
    showP({ state: "unavailable" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalled();
    cleanup();
    expect(showP({ state: "empty" }).container.textContent).toContain("Nobody owes you money.");
    cleanup();
    expect(render(<PaymentsSkeleton />).container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});
