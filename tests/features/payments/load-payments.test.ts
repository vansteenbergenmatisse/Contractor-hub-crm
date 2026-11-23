import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvoicesRead, LiveInvoiceRow } from "@/features/invoices";
import { loadPayments, type LiveTransactionRow, type TransactionsRead } from "@/features/payments";

// All values are fake.
const inv = (over: Partial<LiveInvoiceRow> = {}): LiveInvoiceRow => ({
  id: "i1", status: "sent", liveMode: true, name: "Spring cleanup", number: "19", contactName: "Pat Test", currency: "USD",
  issueDate: "2026-03-01", dueDate: "2026-03-15", total: 999, amountDue: 999, amountPaid: 0, ...over,
});
const txn = (over: Partial<LiveTransactionRow> = {}): LiveTransactionRow => ({
  id: "t1", contactName: "Sam Test", currency: "USD", amount: 100, amountRefunded: 0, status: "succeeded", liveMode: true, createdAt: "2026-03-02T10:00:00.000Z", ...over,
});
const invoicesOk = (rows: LiveInvoiceRow[], complete = true): InvoicesRead => ({ ok: true, rows, expected: rows.length, dropped: 0, complete });
const txnsOk = (rows: LiveTransactionRow[], complete = true): TransactionsRead => ({ ok: true, rows, expected: rows.length, dropped: 0, complete });
const read = (a: InvoicesRead, b: TransactionsRead) => ({ invoices: vi.fn(async () => a), transactions: vi.fn(async () => b) });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("loadPayments", () => {
  it("is unavailable with no tenant, without reading", async () => {
    const readers = read(invoicesOk([]), txnsOk([]));
    expect(await loadPayments(null, readers)).toEqual({ state: "unavailable" });
    expect(readers.invoices).not.toHaveBeenCalled();
  });

  it.each(["PAYMENTS_READ_DISABLED", "INVOICES_READ_DISABLED"])("%s=true turns the read off", async (flag) => {
    vi.stubEnv(flag, "true");
    const readers = read(invoicesOk([inv()]), txnsOk([]));
    expect(await loadPayments("t", readers)).toEqual({ state: "unavailable" });
    expect(readers.invoices).not.toHaveBeenCalled();
    expect(readers.transactions).not.toHaveBeenCalled();
  });

  it.each(["reconnect", "unavailable"] as const)("passes on an invoice read's %s", async (reason) => {
    expect(await loadPayments("t", read({ ok: false, reason }, txnsOk([txn()])))).toEqual({ state: reason });
  });

  it("shows only invoices proven due, with the proven total", async () => {
    const out = await loadPayments("t", read(invoicesOk([inv(), inv({ id: "p", status: "paid", amountDue: 0 }), inv({ id: "d", status: "draft" })]), txnsOk([txn()])));
    expect(out).toMatchObject({ state: "ready", total: { amount: 999, currency: "USD", count: 1 }, blocked: false });
    if (out.state !== "ready") throw new Error("not ready");
    expect(out.due.map((r) => r.id)).toEqual(["i1"]);
    expect(out.transactions?.rows[0]).toMatchObject({ name: "Sam Test", amountText: "USD 100", statusLabel: "Succeeded", dateText: "Mar 2, 2026 (UTC)" });
  });

  it("never adds up transactions as money received", async () => {
    const out = await loadPayments("t", read(invoicesOk([inv()]), txnsOk([txn(), txn({ id: "t2" })])));
    expect(JSON.stringify(out)).not.toContain("200");
  });

  it("is empty only when both complete reads prove nothing is owed and nothing is recorded", async () => {
    expect(await loadPayments("t", read(invoicesOk([inv({ status: "paid", amountDue: 0 })]), txnsOk([])))).toEqual({ state: "empty" });
    expect((await loadPayments("t", read(invoicesOk([]), txnsOk([], false)))).state).toBe("ready");
  });

  it("never says nobody owes after an incomplete invoice read", async () => {
    expect(await loadPayments("t", read(invoicesOk([inv({ status: "paid" })], false), txnsOk([])))).toEqual({ state: "unavailable" });
  });

  it("shows no total on an incomplete read, but keeps the proven rows", async () => {
    const out = await loadPayments("t", read(invoicesOk([inv()], false), txnsOk([])));
    expect(out).toMatchObject({ state: "ready", total: null, blocked: true, complete: false });
  });

  it("keeps what is owed when only the payment history fails", async () => {
    const out = await loadPayments("t", read(invoicesOk([inv()]), { ok: false, reason: "unavailable" }));
    expect(out).toMatchObject({ state: "ready", transactions: null });
    const thrown = { invoices: vi.fn(async () => invoicesOk([inv()])), transactions: vi.fn().mockRejectedValue(new Error("x")) };
    expect(await loadPayments("t", thrown)).toMatchObject({ state: "ready", transactions: null });
  });

  it("does not claim empty when the history failed", async () => {
    const out = await loadPayments("t", read(invoicesOk([]), { ok: false, reason: "unavailable" }));
    expect(out).toMatchObject({ state: "ready", due: [], transactions: null });
  });

  it("marks a test payment, and shows a refund only when the field proves one", async () => {
    const out = await loadPayments("t", read(invoicesOk([]), txnsOk([txn({ liveMode: false, amountRefunded: 10 }), txn({ id: "t2", amountRefunded: null, status: null, createdAt: null })])));
    if (out.state !== "ready") throw new Error("not ready");
    expect(out.transactions?.rows[0]).toMatchObject({ test: true, refundText: "USD 10 refunded" });
    expect(out.transactions?.rows[1]).toMatchObject({ refundText: null, statusLabel: "Status not shown", dateText: "Date not shown" });
  });
});
