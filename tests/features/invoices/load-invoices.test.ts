import { afterEach, describe, expect, it, vi } from "vitest";
import { dueSummary, formatLiveAmount, loadInvoices, type InvoicesReader, type LiveInvoiceRow } from "@/features/invoices";

// All values are fake.
const row = (over: Partial<LiveInvoiceRow> = {}): LiveInvoiceRow => ({
  id: "i1", status: "sent", liveMode: true, name: "Spring cleanup", number: "19", contactName: "Pat Test", currency: "USD",
  issueDate: "2026-03-01", dueDate: "2026-03-15", total: 999, amountDue: 999, amountPaid: 0, ...over,
});
const reader = (rows: LiveInvoiceRow[], extra: { complete?: boolean; dropped?: number } = {}): InvoicesReader =>
  vi.fn(async () => ({ ok: true as const, rows, expected: rows.length, dropped: extra.dropped ?? 0, complete: extra.complete ?? true }));
const ready = async (rows: LiveInvoiceRow[], extra: { complete?: boolean; dropped?: number } = {}) => {
  const out = await loadInvoices("t", reader(rows, extra));
  if (out.state !== "ready") throw new Error(`not ready: ${out.state}`);
  return out;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("loadInvoices states", () => {
  it("is unavailable with no tenant, without reading", async () => {
    const read = reader([]);
    expect(await loadInvoices(null, read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("INVOICES_READ_DISABLED=true turns the read off", async () => {
    vi.stubEnv("INVOICES_READ_DISABLED", "true");
    const read = reader([row()]);
    expect(await loadInvoices("t", read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["reconnect", "unavailable"] as const)("passes on %s", async (reason) => {
    expect(await loadInvoices("t", vi.fn(async () => ({ ok: false as const, reason })))).toEqual({ state: reason });
  });

  it("a reader that throws is unavailable", async () => {
    expect(await loadInvoices("t", vi.fn().mockRejectedValue(new Error("x")))).toEqual({ state: "unavailable" });
  });

  it("is empty only after a complete read", async () => {
    expect(await loadInvoices("t", reader([]))).toEqual({ state: "empty" });
    expect(await loadInvoices("t", reader([], { complete: false }))).toEqual({ state: "unavailable" });
    expect(await loadInvoices("t", reader([], { dropped: 1, complete: false }))).toEqual({ state: "unavailable" });
  });

  it("logs a count only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await loadInvoices("t", reader([row()], { dropped: 2, complete: false }));
    expect(JSON.stringify(warn.mock.calls)).toContain("2");
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Pat Test|Spring/);
  });
});

describe("what counts as due", () => {
  it("sums amountDue of sent and partly paid invoices in one currency", () => {
    const out = dueSummary([row({ id: "a", amountDue: 100.1 }), row({ id: "b", status: "partially_paid", amountDue: 200.2 })], true);
    expect(out.total).toEqual({ amount: 300.3, currency: "USD", count: 2 });
    expect(out.blocked).toBe(false);
  });

  it.each(["draft", "paid", "void"] as const)("does not count a %s invoice", (status) => {
    const out = dueSummary([row({ status })], true);
    expect(out.due).toEqual([]);
    expect(out.total).toBeNull();
    expect(out.blocked).toBe(false);
  });

  it("does not count a processing payment, and shows no total while one is unresolved", () => {
    const out = dueSummary([row(), row({ id: "p", status: "payment_processing" })], true);
    expect(out.due.map((r) => r.id)).toEqual(["i1"]);
    expect(out.total).toBeNull();
    expect(out.blocked).toBe(true);
  });

  it("never treats total minus paid as due", () => {
    const out = dueSummary([row({ total: 500, amountPaid: 100, amountDue: null })], true);
    expect(out.total).toBeNull();
    expect(out.blocked).toBe(true);
  });

  it("leaves out a test invoice and a sent invoice with nothing left to pay", () => {
    const out = dueSummary([row({ id: "test", liveMode: false }), row({ id: "zero", amountDue: 0, amountPaid: 999 }), row({ id: "real", amountDue: 5 })], true);
    expect(out.due.map((r) => r.id)).toEqual(["real"]);
    expect(out.total?.amount).toBe(5);
  });

  it.each<[string, LiveInvoiceRow[], boolean]>([
    ["an incomplete read", [row()], false],
    ["an unreadable amount", [row(), row({ id: "b", amountDue: null })], true],
    ["a missing currency", [row(), row({ id: "b", currency: null })], true],
    ["two currencies", [row(), row({ id: "b", currency: "CAD" })], true],
    ["an unknown status", [row(), row({ id: "b", status: null })], true],
    ["an unknown live or test mode", [row(), row({ id: "b", liveMode: null })], true],
    ["an amount in exponent form", [row(), row({ id: "b", amountDue: 1e-7 })], true],
  ])("shows no total with %s", (_label, rows, complete) => {
    const out = dueSummary(rows, complete);
    expect(out.total).toBeNull();
    expect(out.blocked).toBe(true);
  });
});

describe("the rows", () => {
  it("shows the amount as sent, with its currency code and no symbol or unit change", async () => {
    const { rows, total } = await ready([row({ amountDue: 1234.5 })]);
    expect(rows[0]).toMatchObject({ name: "Pat Test", detail: "Invoice 19 · Spring cleanup", amountText: "USD 1,234.5", dueText: "Due Mar 15, 2026", statusLabel: "Sent" });
    expect(total).toMatchObject({ amount: 1234.5, currency: "USD" });
    expect(formatLiveAmount(1000, null)).toBe("1,000");
    expect(formatLiveAmount(null, "USD")).toBe("Amount not shown");
  });

  it("shows the invoice total on a row that is not due, and no due line", async () => {
    const { rows } = await ready([row({ status: "paid", total: 300, amountDue: 0 })]);
    expect(rows[0]).toMatchObject({ amountText: "USD 300", dueText: null, bucket: "paid" });
  });

  it("marks a test invoice", async () => {
    expect((await ready([row({ liveMode: false })])).rows[0].test).toBe(true);
  });

  it("never invents a date, name or number", async () => {
    const { rows } = await ready([row({ dueDate: null, contactName: null, name: null, number: null })]);
    expect(rows[0]).toMatchObject({ name: "No name", detail: "Invoice", dueText: "Due date not shown" });
  });
});
