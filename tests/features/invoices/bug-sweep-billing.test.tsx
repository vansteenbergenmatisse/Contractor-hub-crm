import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseInvoicePage, parseWorkflowSearch } from "@/features/highlevel";
import { InvoicesLivePage, loadInvoices, type InvoicesRead, type LiveInvoiceRow } from "@/features/invoices";
import { PaymentsLivePage, loadPayments, type TransactionsRead } from "@/features/payments";

// Every value is fake. No test calls HighLevel.
const LOC = "loc-test";
const row = (over: Partial<LiveInvoiceRow> = {}): LiveInvoiceRow => ({
  id: "i1", status: "sent", liveMode: true, name: "Spring cleanup", number: "19", contactName: "Pat Test", currency: "USD",
  issueDate: "2026-03-01", dueDate: "2026-03-15", total: 999, amountDue: 999, amountPaid: 0, ...over,
});
const invoicesOk = (rows: LiveInvoiceRow[], complete = true): InvoicesRead => ({ ok: true, rows, expected: rows.length, dropped: 0, complete });
const noTransactions: TransactionsRead = { ok: true, rows: [], expected: 0, dropped: 0, complete: true };
const payments = (rows: LiveInvoiceRow[], complete = true) =>
  loadPayments("t", { invoices: vi.fn(async () => invoicesOk(rows, complete)), transactions: vi.fn(async () => noTransactions) });
const rawInvoice = (over: Record<string, unknown>) => ({ _id: "inv-1", altId: LOC, altType: "location", status: "sent", ...over });

describe("B2: an open invoice with no liveMode on Payments", () => {
  it("stays listed, with no amount and no total", async () => {
    const out = await payments([row(), row({ id: "unknown", liveMode: null, amountDue: 250 })]);
    if (out.state !== "ready") throw new Error("not ready");
    expect(out.due.map((r) => r.id)).toEqual(["i1", "unknown"]);
    expect(out.due[1].amountText).toBe("Amount not shown");
    expect(out.total).toBeNull();
    expect(out.blocked).toBe(true);
  });

  it("does not list a test, paid or nothing-owed invoice", async () => {
    const out = await payments([row({ id: "test", liveMode: false }), row({ id: "paid", status: "paid", liveMode: null, amountDue: 0 }), row({ id: "zero", liveMode: null, amountDue: 0, amountPaid: 999 })]);
    expect(out.state === "ready" ? out.due : []).toEqual([]);
  });
});

describe("B5: the warning names why no total is shown", () => {
  const processing = [row(), row({ id: "p", status: "payment_processing" })];
  const mixed = [row(), row({ id: "c", currency: "CAD" })];
  const PROCESSING = "A payment is still processing, so no total is shown.";
  const CURRENCIES = "Invoices are in more than one currency, so no total is shown.";
  const invoicesHtml = async (rows: LiveInvoiceRow[], complete = true) =>
    renderToStaticMarkup(<InvoicesLivePage result={await loadInvoices("t", async () => invoicesOk(rows, complete))} />);
  const paymentsHtml = async (rows: LiveInvoiceRow[], complete = true) =>
    renderToStaticMarkup(<PaymentsLivePage result={await payments(rows, complete)} />);

  it.each([["Invoices", invoicesHtml], ["Payments", paymentsHtml]] as const)("%s: processing and mixed currency", async (_page, html) => {
    expect(await html(processing)).toContain(PROCESSING);
    expect(await html(mixed)).toContain(CURRENCIES);
  });

  it.each([["Invoices", invoicesHtml], ["Payments", paymentsHtml]] as const)("%s: an incomplete read keeps its own warning", async (_page, html) => {
    expect(await html(mixed, false)).toContain("Not every invoice could be read, so no total is shown.");
  });

  it.each([["Invoices", invoicesHtml], ["Payments", paymentsHtml]] as const)("%s: an unreadable row keeps the read warning", async (_page, html) => {
    expect(await html([...processing, row({ id: "bad", amountDue: null })])).toContain("Some invoices could not be read in full, so no total is shown.");
  });
});

describe("B6: a workflow row with locationId null", () => {
  it("is kept and is not counted as foreign", () => {
    const out = parseWorkflowSearch({ workflows: [{ id: "w1", name: "Flow", status: "draft", locationId: null }] }, LOC);
    expect(out.workflows.map((w) => w.id)).toEqual(["w1"]);
    expect(out).toMatchObject({ dropped: 0, foreign: 0 });
  });

  it("still counts a row naming another location", () => {
    expect(parseWorkflowSearch({ workflows: [{ id: "w1", locationId: "loc-other" }] }, LOC).foreign).toBe(1);
  });
});

describe("B7: invoice dates", () => {
  const parsed = (value: unknown) => parseInvoicePage({ invoices: [rawInvoice({ issueDate: value, dueDate: value })], total: 1 }, LOC).rows[0];

  it.each([
    ["2026-03-04T00:00:00.000Z", "2026-03-04"],
    ["2026-03-04T23:30:00-05:00", "2026-03-04"],
    ["2026-03-04", "2026-03-04"],
  ])("reads %s as the day written in it", (value, day) => {
    expect([parsed(value).issueDate, parsed(value).dueDate]).toEqual([day, day]);
  });

  it.each([["2026-03-04T10:00:00"], ["2026-02-31T00:00:00Z"], ["Mar 4 2026 10:00 Z"]])("reads %s as missing", (value) => {
    expect(parsed(value).dueDate).toBeNull();
  });
});
