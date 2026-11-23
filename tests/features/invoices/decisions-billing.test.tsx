import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BILLING_MAX_PAGES,
  BILLING_PAGE_SIZE,
  buildInvoicesReader,
  readFailureReason,
  type BillingRuntime,
} from "@/features/highlevel";
import { dueSummary, invoiceView, InvoicesLivePage, loadInvoices, type LiveInvoiceRow } from "@/features/invoices";
import { loadPayments, PaymentsLivePage } from "@/features/payments";

// All values are fake.
const LOC = "loc-a";
const row = (over: Partial<LiveInvoiceRow> = {}): LiveInvoiceRow => ({
  id: "i1", status: "sent", liveMode: true, name: "Spring cleanup", number: "19", contactName: "Pat Test", currency: "USD",
  issueDate: "2026-03-01", dueDate: "2026-03-15", total: 999, amountDue: 0, amountPaid: 0, ...over,
});
const raw = (id: string) => ({
  _id: id, status: "sent", liveMode: true, amountPaid: 0, altId: LOC, altType: "location", name: "Spring cleanup",
  invoiceNumber: "19", currency: "USD", contactDetails: { name: "Pat Test" }, issueDate: "2026-03-01", dueDate: "2026-03-15",
  total: 999, amountDue: 999,
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const runtime = (invoices: BillingRuntime["requests"]["invoices"]): BillingRuntime => ({
  readLocationId: async () => LOC,
  withLocationToken: async (_t, call) => call("token"),
  withStoredLocationToken: async (_t, call) => call("token"),
  requests: { invoices, transactions: vi.fn() },
});
const page = (offset: number) => Array.from({ length: BILLING_PAGE_SIZE }, (_, i) => raw(`p${offset}-${i}`));
const invoicesOk = (rows: LiveInvoiceRow[]) => ({ ok: true as const, rows, expected: rows.length, dropped: 0, complete: true });
const noTransactions = { ok: true as const, rows: [], expected: 0, dropped: 0, complete: true };

afterEach(() => vi.restoreAllMocks());

describe("B1: an open invoice with nothing due and nothing paid", () => {
  it.each<[string, Partial<LiveInvoiceRow>]>([
    ["sent, nothing paid", {}],
    ["partly paid status, nothing paid", { status: "partially_paid" }],
    ["paid amount unreadable", { amountPaid: null }],
    ["live mode unknown", { liveMode: null }],
  ])("reads Check this invoice and blocks the total: %s", (_label, over) => {
    const bad = row(over);
    expect(invoiceView(bad)).toMatchObject({ statusLabel: "Check this invoice", tone: "is-warn", amountText: "Amount not shown" });
    expect(dueSummary([bad], true)).toMatchObject({ due: [], total: null, blocked: true });
  });

  it("is listed on Payments and never reads as nobody owing", async () => {
    const out = await loadPayments("t", { invoices: async () => invoicesOk([row()]), transactions: async () => noTransactions });
    if (out.state !== "ready") throw new Error(`not ready: ${out.state}`);
    expect(out.due.map((r) => r.statusLabel)).toEqual(["Check this invoice"]);
    const html = renderToStaticMarkup(<PaymentsLivePage result={out} />);
    expect(html).toContain("Check this invoice");
    expect(html).not.toContain("Nobody owes");
  });

  it("shows the chip on Invoices", async () => {
    const html = renderToStaticMarkup(<InvoicesLivePage result={await loadInvoices("t", async () => invoicesOk([row()]))} />);
    expect(html).toContain("Check this invoice");
  });

  it.each<[string, Partial<LiveInvoiceRow>]>([
    ["something was paid", { amountPaid: 999 }],
    ["a test invoice", { liveMode: false }],
    ["a paid invoice", { status: "paid" }],
    ["a draft", { status: "draft" }],
    ["a void invoice", { status: "void" }],
  ])("keeps its normal reading: %s", (_label, over) => {
    const fine = row(over);
    expect(invoiceView(fine).statusLabel).not.toBe("Check this invoice");
    expect(dueSummary([fine], true).blocked).toBe(false);
  });
});

describe("B3: only a rejected token asks to reconnect", () => {
  it.each([[401, "reconnect"], [403, "unavailable"], [404, "unavailable"], [429, "unavailable"], [500, "unavailable"], [null, "unavailable"]] as const)(
    "status %s reads as %s",
    (status, reason) => expect(readFailureReason(status)).toBe(reason),
  );
});

describe("B4: a full last page with a known total", () => {
  const reader = (total: number) => {
    const invoices = vi.fn(async (_t: string, _l: string, offset: number) => json({ invoices: page(offset), total }));
    return { invoices, read: buildInvoicesReader(() => runtime(invoices), async () => true) };
  };

  it("is complete at exactly the most rows the cap can read", async () => {
    const expected = BILLING_PAGE_SIZE * BILLING_MAX_PAGES;
    const { invoices, read } = reader(expected);
    expect(await read("t")).toMatchObject({ ok: true, complete: true, expected });
    expect(invoices).toHaveBeenCalledTimes(BILLING_MAX_PAGES);
  });

  it("stays incomplete when the total is past the cap", async () => {
    const expected = BILLING_PAGE_SIZE * BILLING_MAX_PAGES + 1;
    expect(await reader(expected).read("t")).toMatchObject({ ok: true, complete: false, expected });
  });

  it("stays incomplete when the total moves on the last page", async () => {
    const full = BILLING_PAGE_SIZE * BILLING_MAX_PAGES;
    const invoices = vi.fn(async (_t: string, _l: string, offset: number) => json({ invoices: page(offset), total: offset === 0 ? full + 1 : full }));
    expect(await buildInvoicesReader(() => runtime(invoices), async () => true)("t")).toMatchObject({ ok: true, complete: false });
  });
});
