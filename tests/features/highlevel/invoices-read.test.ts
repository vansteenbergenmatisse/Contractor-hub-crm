import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BILLING_MAX_PAGES,
  BILLING_PAGE_SIZE,
  HighLevelHttpError,
  MAX_BILLING_RESPONSE_BYTES,
  TokenServiceError,
  buildInvoicesReader,
  buildTransactionsReader,
  createBillingRequests,
  parseInvoicePage,
  parseTransactionPage,
  type BillingRuntime,
} from "@/features/highlevel";

// Fixtures follow apps/invoices.json and apps/payments.json at commit 0af86a4. All values are fake.
const LOC = "loc-a";
const invoice = (over: Record<string, unknown> = {}) => ({
  _id: "inv-1", status: "sent", liveMode: true, amountPaid: 0, altId: LOC, altType: "location", name: "Spring cleanup",
  invoiceNumber: "19", currency: "USD", contactDetails: { name: "Pat Test", email: "pat@example.test", phoneNo: "+15550000000" },
  issueDate: "2026-03-01", dueDate: "2026-03-15", total: 999, amountDue: 999, ...over,
});
const txn = (over: Record<string, unknown> = {}) => ({
  _id: "txn-1", altId: LOC, altType: "location", contactName: "Pat Test", contactEmail: "pat@example.test", currency: "USD",
  amount: 100, amountRefunded: 0, status: "succeeded", liveMode: true, createdAt: "2026-03-02T10:00:00.000Z", ipAddress: "192.0.2.1", ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const allow = vi.fn(async () => true);

function runtime(invoices: BillingRuntime["requests"]["invoices"], transactions: BillingRuntime["requests"]["transactions"] = vi.fn()): BillingRuntime {
  const withToken = vi.fn(async (_tenant: string, call: (token: string) => Promise<Response>) => call("token-fresh"));
  const withStored = vi.fn(async (_tenant: string, call: (token: string) => Promise<Response>) => call("token-stored"));
  return { readLocationId: async () => LOC, withLocationToken: withToken, withStoredLocationToken: withStored, requests: { invoices, transactions } };
}

afterEach(() => {
  vi.restoreAllMocks();
  allow.mockClear();
});

describe("createBillingRequests", () => {
  it("sends one GET per documented path, with the documented query and Version", async () => {
    const doFetch = vi.fn(async () => json({})) as unknown as typeof fetch;
    const requests = createBillingRequests("https://hl.test/", doFetch);
    await requests.invoices("tok", LOC, 200);
    await requests.transactions("tok", LOC, 100);
    const calls = (doFetch as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit]>;
    const first = new URL(calls[0][0]);
    expect(first.pathname).toBe("/invoices/");
    expect(Object.fromEntries(first.searchParams)).toEqual({ altId: LOC, altType: "location", limit: String(BILLING_PAGE_SIZE), offset: "200", sortField: "issueDate", sortOrder: "descend" });
    const second = new URL(calls[1][0]);
    expect(second.pathname).toBe("/payments/transactions");
    expect(Object.fromEntries(second.searchParams)).toEqual({ altId: LOC, altType: "location", limit: String(BILLING_PAGE_SIZE), offset: "100" });
    for (const [, init] of calls) {
      expect(init.method).toBe("GET");
      expect(init.body).toBeUndefined();
      expect(init.headers).toMatchObject({ authorization: "Bearer tok", version: "2021-07-28" });
    }
  });

  it("turns a network failure into a status-less HTTP error", async () => {
    const requests = createBillingRequests("https://hl.test", vi.fn().mockRejectedValue(new Error("secret")) as unknown as typeof fetch);
    await expect(requests.invoices("tok", LOC, 0)).rejects.toBeInstanceOf(HighLevelHttpError);
  });
});

describe("parseInvoicePage", () => {
  it("keeps only the shown fields, never contact phone or email", () => {
    const page = parseInvoicePage({ invoices: [invoice()], total: 1 }, LOC);
    expect(page.rows).toEqual([{
      id: "inv-1", status: "sent", liveMode: true, name: "Spring cleanup", number: "19", contactName: "Pat Test", currency: "USD",
      issueDate: "2026-03-01", dueDate: "2026-03-15", total: 999, amountDue: 999, amountPaid: 0,
    }]);
    expect(JSON.stringify(page)).not.toMatch(/example\.test|5550000/);
  });

  it("drops another location's row, a row with no location and a row with no id", () => {
    const { altId: _unused, ...noLocation } = invoice();
    void _unused;
    const page = parseInvoicePage({ invoices: [invoice({ altId: "loc-b" }), noLocation, invoice({ _id: "" }), invoice({ _id: "ok" })], total: 4 }, LOC);
    expect(page.rows.map((r) => r.id)).toEqual(["ok"]);
    expect(page.dropped).toBe(3);
    expect(page.received).toBe(4);
  });

  it.each([["a string", "999"], ["negative", -1], ["infinite-like", 1e400], ["null", null]])("reads an amount that is %s as unknown", (_label, value) => {
    expect(parseInvoicePage({ invoices: [invoice({ amountDue: value })], total: 1 }, LOC).rows[0].amountDue).toBeNull();
  });

  it("reads an undocumented status, a bad currency and a bad date as unknown", () => {
    const [row] = parseInvoicePage({ invoices: [invoice({ status: "overdue", currency: "dollars", dueDate: "2026-02-31" })], total: 1 }, LOC).rows;
    expect([row.status, row.currency, row.dueDate]).toEqual([null, null, null]);
  });

  it.each([{ invoices: {}, total: 1 }, { invoices: [] }, { invoices: [], total: -1 }, { invoices: [], total: "3" }, null])("rejects the malformed answer %j", (body) => {
    expect(() => parseInvoicePage(body, LOC)).toThrow();
  });
});

describe("parseTransactionPage", () => {
  it("keeps only the shown fields", () => {
    const page = parseTransactionPage({ data: [txn()], totalCount: 1 }, LOC);
    expect(page.rows).toEqual([{ id: "txn-1", contactName: "Pat Test", currency: "USD", amount: 100, amountRefunded: 0, status: "succeeded", liveMode: true, createdAt: "2026-03-02T10:00:00.000Z" }]);
    expect(JSON.stringify(page)).not.toMatch(/example\.test|192\.0/);
  });

  it("drops another location's row and reads a non-text status and a zoneless time as unknown", () => {
    const page = parseTransactionPage({ data: [txn({ altId: "loc-b" }), txn({ _id: "t2", status: { a: 1 }, createdAt: "2026-03-02T10:00:00" })], totalCount: 2 }, LOC);
    expect(page.dropped).toBe(1);
    expect(page.rows[0]).toMatchObject({ id: "t2", status: null, createdAt: null });
  });
});

describe("buildInvoicesReader", () => {
  it("pages by offset until the documented total is reached", async () => {
    const pageOne = Array.from({ length: BILLING_PAGE_SIZE }, (_, i) => invoice({ _id: `a${i}` }));
    const invoices = vi.fn(async (_t: string, _l: string, offset: number) => json(offset === 0 ? { invoices: pageOne, total: 101 } : { invoices: [invoice({ _id: "last" })], total: 101 }));
    const out = await buildInvoicesReader(() => runtime(invoices), allow)("tenant-a");
    expect(out).toMatchObject({ ok: true, complete: true, expected: 101, dropped: 0 });
    expect(out.ok && out.rows).toHaveLength(101);
    expect(invoices.mock.calls.map((c) => c[2])).toEqual([0, BILLING_PAGE_SIZE]);
  });

  it("is incomplete when the page cap stops it", async () => {
    let n = 0;
    const invoices = vi.fn(async () => json({ invoices: Array.from({ length: BILLING_PAGE_SIZE }, () => invoice({ _id: `r${n++}` })), total: 1000 }));
    const out = await buildInvoicesReader(() => runtime(invoices), allow)("t");
    expect(invoices).toHaveBeenCalledTimes(BILLING_MAX_PAGES);
    expect(out).toMatchObject({ ok: true, complete: false });
  });

  it.each([
    ["a dropped row", [{ invoices: [invoice(), invoice({ _id: "x", altId: "loc-b" })], total: 2 }]],
    ["fewer rows than the total", [{ invoices: [invoice()], total: 2 }, { invoices: [], total: 2 }]],
    ["more rows than the total", [{ invoices: [invoice(), invoice({ _id: "b" })], total: 1 }]],
    ["a total that moves between pages", [{ invoices: [invoice()], total: 2 }, { invoices: [invoice({ _id: "b" })], total: 3 }, { invoices: [invoice({ _id: "c" })], total: 3 }]],
    ["a row repeated across pages", [{ invoices: [invoice()], total: 2 }, { invoices: [invoice()], total: 2 }]],
  ])("is incomplete with %s", async (_label, pages) => {
    let i = 0;
    const invoices = vi.fn(async () => json(pages[Math.min(i++, pages.length - 1)]));
    expect(await buildInvoicesReader(() => runtime(invoices), allow)("t")).toMatchObject({ ok: true, complete: false });
  });

  it.each([[401, "reconnect"], [403, "reconnect"], [429, "unavailable"], [500, "unavailable"]])("maps status %i to %s without a retry", async (status, reason) => {
    const invoices = vi.fn(async () => json({}, status));
    expect(await buildInvoicesReader(() => runtime(invoices), allow)("t")).toEqual({ ok: false, reason });
    expect(invoices).toHaveBeenCalledTimes(1);
  });

  it("a failing later page fails the whole read", async () => {
    const invoices = vi.fn(async (_t: string, _l: string, offset: number) => (offset === 0 ? json({ invoices: [invoice()], total: 2 }) : json({}, 500)));
    expect(await buildInvoicesReader(() => runtime(invoices), allow)("t")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("refuses a body over the size cap", async () => {
    const big = new Response("x", { headers: { "content-length": String(MAX_BILLING_RESPONSE_BYTES + 1) } });
    expect(await buildInvoicesReader(() => runtime(vi.fn(async () => big)), allow)("t")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("asks to reconnect when the tenant has no location or the token is gone", async () => {
    const rt = runtime(vi.fn());
    expect(await buildInvoicesReader(() => ({ ...rt, readLocationId: async () => null }), allow)("t")).toEqual({ ok: false, reason: "reconnect" });
    const noToken = { ...rt, withLocationToken: vi.fn().mockRejectedValue(new TokenServiceError("needs_reconnect")) };
    expect(await buildInvoicesReader(() => noToken, allow)("t")).toEqual({ ok: false, reason: "reconnect" });
  });

  it("throttles per tenant before any env or token work, and denies on a limiter failure", async () => {
    const make = vi.fn(() => runtime(vi.fn()));
    const denied = vi.fn(async () => false);
    expect(await buildInvoicesReader(make, denied)("tenant-a")).toEqual({ ok: false, reason: "unavailable" });
    expect(denied.mock.calls[0]).toEqual(expect.arrayContaining(["highlevel-invoices:tenant-a"]));
    expect(await buildInvoicesReader(make, vi.fn().mockRejectedValue(new Error("db")))("t")).toEqual({ ok: false, reason: "unavailable" });
    expect(make).not.toHaveBeenCalled();
  });

  it("a viewer uses the stored token and a per-viewer key", async () => {
    const rt = runtime(vi.fn(async () => json({ invoices: [], total: 0 })));
    const hit = vi.fn(async () => true);
    await buildInvoicesReader(() => rt, hit, { viewerId: "admin-1" })("tenant-a");
    expect(hit.mock.calls[0]).toEqual(expect.arrayContaining(["highlevel-invoices-view:admin-1"]));
    expect(rt.withStoredLocationToken).toHaveBeenCalled();
    expect(rt.withLocationToken).not.toHaveBeenCalled();
  });

  it("logs the step and status only", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await buildInvoicesReader(() => runtime(vi.fn(async () => json({ message: "Pat Test" }, 500))), allow)("tenant-a");
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("status=500");
    expect(logged).not.toMatch(/Pat Test|tenant-a|loc-a|token/);
  });
});

describe("buildTransactionsReader", () => {
  it("reads through totalCount with its own throttle key", async () => {
    const transactions = vi.fn(async () => json({ data: [txn()], totalCount: 1 }));
    const hit = vi.fn(async () => true);
    const out = await buildTransactionsReader(() => runtime(vi.fn(), transactions), hit)("tenant-a");
    expect(out).toMatchObject({ ok: true, complete: true, expected: 1 });
    expect(hit.mock.calls[0]).toEqual(expect.arrayContaining(["highlevel-payments:tenant-a"]));
  });

  it("a viewer uses the stored token and a per-viewer key", async () => {
    const rt = runtime(vi.fn(), vi.fn(async () => json({ data: [], totalCount: 0 })));
    const hit = vi.fn(async () => true);
    await buildTransactionsReader(() => rt, hit, { viewerId: "admin-1" })("tenant-a");
    expect(hit.mock.calls[0]).toEqual(expect.arrayContaining(["highlevel-payments-view:admin-1"]));
    expect(rt.withStoredLocationToken).toHaveBeenCalled();
  });
});
