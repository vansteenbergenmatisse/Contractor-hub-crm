import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BILLING_MAX_PAGES,
  BILLING_PAGE_SIZE,
  buildInvoicesReader,
  createBillingRequests,
  createTenantBillingReaders,
  parseInvoicePage,
  parseTransactionPage,
  type BillingRuntime,
} from "@/features/highlevel";
import { dueSummary, invoiceView, loadInvoices, type LiveInvoiceRow } from "@/features/invoices";
import { loadPayments } from "@/features/payments";

// All values are fake.
const LOC = "loc-a";
const raw = (over: Record<string, unknown> = {}) => ({
  _id: "inv-1", status: "sent", liveMode: true, amountPaid: 0, altId: LOC, altType: "location", name: "Spring cleanup",
  invoiceNumber: "19", currency: "USD", contactDetails: { name: "Pat Test" }, issueDate: "2026-03-01", dueDate: "2026-03-15",
  total: 999, amountDue: 999, ...over,
});
const row = (over: Partial<LiveInvoiceRow> = {}): LiveInvoiceRow => ({
  id: "i1", status: "sent", liveMode: true, name: "Spring cleanup", number: "19", contactName: "Pat Test", currency: "USD",
  issueDate: "2026-03-01", dueDate: "2026-03-15", total: 999, amountDue: 999, amountPaid: 0, ...over,
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const allow = async () => true;
const runtime = (invoices: BillingRuntime["requests"]["invoices"]): BillingRuntime => ({
  readLocationId: async () => LOC,
  withLocationToken: async (_t, call) => call("token"),
  withStoredLocationToken: async (_t, call) => call("token"),
  requests: { invoices, transactions: vi.fn() },
});
const fullPage = (prefix: string) => Array.from({ length: BILLING_PAGE_SIZE }, (_, i) => raw({ _id: `${prefix}${i}` }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("amountDue above total", () => {
  it("the parser marks both amounts unreadable", () => {
    const [parsed] = parseInvoicePage({ invoices: [raw({ total: 10, amountDue: 1000 })], total: 1 }, LOC).rows;
    expect([parsed.amountDue, parsed.total]).toEqual([null, null]);
  });

  it("blocks the total and shows no amount", () => {
    const [bad] = parseInvoicePage({ invoices: [raw({ total: 10, amountDue: 1000 })], total: 1 }, LOC).rows;
    const out = dueSummary([row({ id: "ok" }), bad], true);
    expect(out.due.map((r) => r.id)).toEqual(["ok"]);
    expect(out.total).toBeNull();
    expect(out.blocked).toBe(true);
    expect(invoiceView(bad).amountText).toBe("Amount not shown");
  });
});

describe("due and blocked", () => {
  it.each<[string, Partial<LiveInvoiceRow>]>([
    ["unknown mode", { liveMode: null }],
    ["unreadable amount", { amountDue: null }],
    ["negative amount", { amountDue: -5 }],
  ])("%s is not due, blocks the total and never falls back to row.total", (_label, over) => {
    const bad = row(over);
    const out = dueSummary([bad], true);
    expect(out.due).toEqual([]);
    expect(out.blocked).toBe(true);
    expect(invoiceView(bad).amountText).toBe("Amount not shown");
  });

  it("an open row with no currency shows no amount", () => {
    const bad = row({ currency: null });
    expect(dueSummary([bad], true).blocked).toBe(true);
    expect(invoiceView(bad).amountText).toBe("Amount not shown");
  });

  it("a test row with an unreadable amount does not block", () => {
    expect(dueSummary([row({ liveMode: false, amountDue: null })], true).blocked).toBe(false);
  });

  it("an open live row with nothing owed does not block", () => {
    expect(dueSummary([row({ amountDue: 0 })], true)).toMatchObject({ due: [], blocked: false });
  });
});

describe("completeness proof", () => {
  it("a full page reaching the total needs a next page with 0 rows", async () => {
    const invoices = vi.fn(async (_t: string, _l: string, offset: number) => json(offset === 0 ? { invoices: fullPage("a"), total: BILLING_PAGE_SIZE } : { invoices: [], total: BILLING_PAGE_SIZE }));
    const out = await buildInvoicesReader(() => runtime(invoices), allow)("t");
    expect(invoices.mock.calls.map((c) => c[2])).toEqual([0, BILLING_PAGE_SIZE]);
    expect(out).toMatchObject({ ok: true, complete: true });
  });

  it("is incomplete when the proof page still has rows", async () => {
    const invoices = vi.fn(async (_t: string, _l: string, offset: number) => json(offset === 0 ? { invoices: fullPage("a"), total: BILLING_PAGE_SIZE } : { invoices: [raw({ _id: "extra" })], total: BILLING_PAGE_SIZE }));
    expect(await buildInvoicesReader(() => runtime(invoices), allow)("t")).toMatchObject({ ok: true, complete: false });
  });

  it("is incomplete when the page cap prevents the proof", async () => {
    const expected = BILLING_PAGE_SIZE * BILLING_MAX_PAGES;
    const invoices = vi.fn(async (_t: string, _l: string, offset: number) => json({ invoices: fullPage(`p${offset}-`), total: expected }));
    const out = await buildInvoicesReader(() => runtime(invoices), allow)("t");
    expect(invoices).toHaveBeenCalledTimes(BILLING_MAX_PAGES);
    expect(out).toMatchObject({ ok: true, complete: false, expected });
  });
});

describe("createTenantBillingReaders", () => {
  it("returns both readers, built with the same viewer", () => {
    const readers = createTenantBillingReaders(allow, { viewerId: "admin-1" });
    expect(typeof readers.invoices).toBe("function");
    expect(typeof readers.transactions).toBe("function");
  });
});

describe("shared deadline", () => {
  it("passes the caller's signal into the request", async () => {
    const doFetch = vi.fn(async () => json({})) as unknown as typeof fetch;
    const controller = new AbortController();
    await createBillingRequests("https://hl.test", doFetch).invoices("tok", LOC, 0, controller.signal);
    const init = (doFetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    controller.abort();
    expect(init.signal?.aborted).toBe(true);
  });

  it("stops paging once the signal has aborted", async () => {
    const controller = new AbortController();
    const invoices = vi.fn(async () => {
      controller.abort();
      return json({ invoices: fullPage("a"), total: 1000 });
    });
    const out = await buildInvoicesReader(() => runtime(invoices), allow)("t", controller.signal);
    expect(out).toEqual({ ok: false, reason: "unavailable" });
    expect(invoices).toHaveBeenCalledTimes(1);
  });

  it("loadInvoices is unavailable when the deadline passes", async () => {
    vi.useFakeTimers();
    const pending = loadInvoices("t", () => new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await pending).toEqual({ state: "unavailable" });
  });

  it("loadPayments shares one deadline across both reads", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const pending = loadPayments("t", {
      invoices: async (_t, signal) => {
        signals.push(signal as AbortSignal);
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        return { ok: true as const, rows: [row()], expected: 1, dropped: 0, complete: true };
      },
      transactions: (_t, signal) => {
        signals.push(signal as AbortSignal);
        return new Promise(() => {});
      },
    });
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await pending).toEqual({ state: "unavailable" });
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBe(signals[1]);
    expect(signals[0].aborted).toBe(true);
  });
});

describe("size caps", () => {
  it("caps display text at 200 characters", () => {
    const long = "x".repeat(500);
    const [parsed] = parseInvoicePage({ invoices: [raw({ name: long, invoiceNumber: long, contactDetails: { name: long } })], total: 1 }, LOC).rows;
    expect([parsed.name?.length, parsed.number?.length, parsed.contactName?.length]).toEqual([200, 200, 200]);
    const txn = { _id: "t1", altId: LOC, contactName: long, status: long };
    const [shown] = parseTransactionPage({ data: [txn], totalCount: 1 }, LOC).rows;
    expect([shown.contactName?.length, shown.status?.length]).toEqual([200, 200]);
  });

  it("does not split a character at the cap", () => {
    const [parsed] = parseInvoicePage({ invoices: [raw({ name: `${"x".repeat(199)}😀tail` })], total: 1 }, LOC).rows;
    expect(parsed.name).toBe("x".repeat(199));
  });

  it("treats an oversized _id as unreadable", () => {
    const page = parseInvoicePage({ invoices: [raw({ _id: "x".repeat(201) })], total: 1 }, LOC);
    expect(page.rows).toEqual([]);
    expect(page.dropped).toBe(1);
  });
});
