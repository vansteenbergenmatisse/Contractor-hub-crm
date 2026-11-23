import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ESTIMATES_MAX_PAGES,
  ESTIMATES_PAGE_SIZE,
  ESTIMATES_READS_PER_MINUTE,
  HighLevelHttpError,
  MAX_ESTIMATES_RESPONSE_BYTES,
  TokenServiceError,
  buildEstimatesReader,
  createEstimatesRequests,
  parseEstimatePage,
  readEstimates,
  type EstimatesRequests,
  type EstimatesRuntime,
} from "@/features/highlevel";

// All values are fake. The row shape follows EstimateResponseDto in apps/invoices.json at 0af86a4.
const LOC = "loc-a";
const raw = (over: Record<string, unknown> = {}) => ({
  _id: "est-1", altId: LOC, altType: "location", name: "Spring cleanup", currency: "USD", total: 1222.03,
  issueDate: "2026-03-04T00:00:00.000Z", status: "sent", deleted: false,
  contactDetails: { id: "c-1", name: "Pat Test", email: "pat@example.test", phoneNo: "+15550000000" },
  ...over,
});
const answer = (estimates: unknown[], total = estimates.length) => new Response(JSON.stringify({ estimates, total, traceId: "trace" }), { status: 200 });

function deps(pages: Array<Response | Error>, locationId: string | null = LOC) {
  const list = vi.fn<EstimatesRequests["list"]>(async () => {
    const next = pages.shift();
    if (!next) throw new Error("no page");
    if (next instanceof Error) throw next;
    return next;
  });
  return {
    list,
    deps: {
      readLocationId: vi.fn(async () => locationId),
      withToken: vi.fn(async (_tenant: string, call: (token: string) => Promise<Response>) => call("token-a")),
      requests: { list },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createEstimatesRequests", () => {
  it("sends one GET with the documented query and version", async () => {
    const doFetch = vi.fn(async () => answer([])) as unknown as typeof fetch;
    await createEstimatesRequests("https://hl.test/", doFetch).list("token-a", { locationId: LOC, limit: 100, offset: 200 });
    const [url, init] = (doFetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/invoices/estimate/list");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ altId: LOC, altType: "location", limit: "100", offset: "200" });
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ authorization: "Bearer token-a", version: "2021-07-28" });
  });

  it("turns a network failure into a HighLevel error", async () => {
    const doFetch = vi.fn(async () => { throw new Error("secret detail"); }) as unknown as typeof fetch;
    await expect(createEstimatesRequests("https://hl.test", doFetch).list("t", { locationId: LOC, limit: 1, offset: 0 })).rejects.toBeInstanceOf(HighLevelHttpError);
  });
});

describe("parseEstimatePage", () => {
  it("keeps only the fields the page shows", () => {
    const page = parseEstimatePage({ estimates: [raw()], total: 1 }, LOC);
    expect(page.rows).toEqual([{ id: "est-1", name: "Spring cleanup", contactName: "Pat Test", status: "sent", amount: 1222.03, currency: "USD", issuedMs: Date.parse("2026-03-04T00:00:00.000Z") }]);
    expect(JSON.stringify(page)).not.toMatch(/example\.test|\+1555/);
  });

  it("throws when the list or the total is missing or wrong", () => {
    expect(() => parseEstimatePage({ total: 1 }, LOC)).toThrow();
    expect(() => parseEstimatePage({ estimates: [] }, LOC)).toThrow();
    expect(() => parseEstimatePage({ estimates: [], total: -1 }, LOC)).toThrow();
    expect(() => parseEstimatePage({ estimates: [], total: 1.5 }, LOC)).toThrow();
    expect(() => parseEstimatePage({ estimates: [raw()], total: 0 }, LOC)).toThrow();
  });

  it("drops strings, rows without an id, and rows of another or no location", () => {
    const page = parseEstimatePage({ estimates: ["est-9", raw({ _id: "" }), raw({ altId: "loc-b" }), raw({ altId: undefined }), raw({ altType: "company" })], total: 5 }, LOC);
    expect(page.rows).toEqual([]);
    expect(page.dropped).toBe(5);
  });

  it("hides a deleted quote without calling it malformed", () => {
    const page = parseEstimatePage({ estimates: [raw({ deleted: true })], total: 1 }, LOC);
    expect(page).toMatchObject({ rows: [], dropped: 0, seen: 1 });
  });

  it.each([["1222.03"], [-5], [Number.MAX_SAFE_INTEGER + 2], [null]])("never guesses an amount from %s", (total) => {
    expect(parseEstimatePage({ estimates: [raw({ total })], total: 1 }, LOC).rows[0].amount).toBeNull();
  });

  it.each([["usd"], ["DOLLAR"], [""], [5]])("does not claim a currency from %s", (currency) => {
    expect(parseEstimatePage({ estimates: [raw({ currency })], total: 1 }, LOC).rows[0].currency).toBeNull();
  });

  it("keeps only a documented status, and only a date with a zone", () => {
    const row = parseEstimatePage({ estimates: [raw({ status: "paid", issueDate: "2026-03-04" })], total: 1 }, LOC).rows[0];
    expect(row.status).toBeNull();
    expect(row.issuedMs).toBeNull();
  });
});

describe("readEstimates", () => {
  it("reads until the total is reached", async () => {
    const first = Array.from({ length: ESTIMATES_PAGE_SIZE }, (_, i) => raw({ _id: `a-${i}` }));
    const t = deps([answer(first, ESTIMATES_PAGE_SIZE + 1), answer([raw({ _id: "b" })], ESTIMATES_PAGE_SIZE + 1)]);
    const out = await readEstimates(t.deps, "tenant-a");
    expect(out).toMatchObject({ ok: true, total: ESTIMATES_PAGE_SIZE + 1, complete: true, dropped: 0 });
    expect(t.list.mock.calls.map((c) => c[1].offset)).toEqual([0, ESTIMATES_PAGE_SIZE]);
  });

  it("stops at the page cap and says the list is not complete", async () => {
    const pages = Array.from({ length: ESTIMATES_MAX_PAGES + 1 }, (_, p) => answer(Array.from({ length: ESTIMATES_PAGE_SIZE }, (_, i) => raw({ _id: `${p}-${i}` })), 10_000));
    const t = deps(pages);
    const out = await readEstimates(t.deps, "tenant-a");
    expect(t.list).toHaveBeenCalledTimes(ESTIMATES_MAX_PAGES);
    expect(out).toMatchObject({ ok: true, complete: false });
  });

  it("is not complete when a page ends before the total", async () => {
    const out = await readEstimates(deps([answer([raw()], 3), answer([], 3)]).deps, "tenant-a");
    expect(out).toMatchObject({ ok: true, complete: false });
  });

  it("does not show a repeated row twice", async () => {
    const first = Array.from({ length: ESTIMATES_PAGE_SIZE }, (_, i) => raw({ _id: `a-${i}` }));
    const out = await readEstimates(deps([answer(first, ESTIMATES_PAGE_SIZE + 1), answer([raw({ _id: "a-0" })], ESTIMATES_PAGE_SIZE + 1)]).deps, "tenant-a");
    expect(out.ok && out.rows.length).toBe(ESTIMATES_PAGE_SIZE);
  });

  it("asks to reconnect with no location, on 401 and on 403", async () => {
    expect(await readEstimates(deps([], null).deps, "t")).toEqual({ ok: false, reason: "reconnect" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readEstimates(deps([new Response("", { status: 401 })]).deps, "t")).toEqual({ ok: false, reason: "reconnect" });
    expect(await readEstimates(deps([new Response("", { status: 403 })]).deps, "t")).toEqual({ ok: false, reason: "reconnect" });
  });

  it("is unavailable on 429, on a bad body and on an oversized body, with no retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const limited = deps([new Response("", { status: 429 })]);
    expect(await readEstimates(limited.deps, "t")).toEqual({ ok: false, reason: "unavailable" });
    expect(limited.list).toHaveBeenCalledTimes(1);
    expect(await readEstimates(deps([new Response("not json")]).deps, "t")).toEqual({ ok: false, reason: "unavailable" });
    const big = new Response("{}", { headers: { "content-length": String(MAX_ESTIMATES_RESPONSE_BYTES + 1) } });
    expect(await readEstimates(deps([big]).deps, "t")).toEqual({ ok: false, reason: "unavailable" });
    const stream = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(MAX_ESTIMATES_RESPONSE_BYTES + 1)); c.close(); } }));
    expect(await readEstimates(deps([stream]).deps, "t")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("maps token errors and logs the step and status only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = deps([]);
    t.deps.withToken.mockRejectedValueOnce(new TokenServiceError("needs_reconnect"));
    expect(await readEstimates(t.deps, "t")).toEqual({ ok: false, reason: "reconnect" });
    await readEstimates(deps([new Response(JSON.stringify({ secret: "Pat Test" }), { status: 500 })]).deps, "t");
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("step=request status=500");
    expect(logged).not.toMatch(/Pat Test|token-a|loc-a/);
  });
});

describe("buildEstimatesReader", () => {
  const runtime = (): EstimatesRuntime & { own: ReturnType<typeof vi.fn>; stored: ReturnType<typeof vi.fn> } => {
    const own = vi.fn(async (_t: string, call: (token: string) => Promise<Response>) => call("own"));
    const stored = vi.fn(async (_t: string, call: (token: string) => Promise<Response>) => call("stored"));
    return { own, stored, readLocationId: async () => LOC, withLocationToken: own, withStoredLocationToken: stored, requests: { list: async () => answer([raw()]) } };
  };

  it("throttles per tenant", async () => {
    const rt = runtime();
    const hit = vi.fn(async () => true);
    await buildEstimatesReader(() => rt, hit)("tenant-a");
    expect(hit.mock.calls[0].slice(0, 3)).toEqual(["highlevel-estimates:tenant-a", ESTIMATES_READS_PER_MINUTE, 60_000]);
    expect(rt.own).toHaveBeenCalled();
    expect(rt.stored).not.toHaveBeenCalled();
  });

  it("uses the stored token and a per-viewer key for a viewer", async () => {
    const rt = runtime();
    const hit = vi.fn(async () => true);
    await buildEstimatesReader(() => rt, hit, { viewerId: "admin-1" })("tenant-a");
    expect((hit.mock.calls[0] as unknown[])[0]).toBe("highlevel-estimates-view:admin-1");
    expect(rt.stored).toHaveBeenCalled();
    expect(rt.own).not.toHaveBeenCalled();
  });

  it("makes no call when throttled or when the limiter fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const make = vi.fn(runtime);
    expect(await buildEstimatesReader(make, async () => false)("t")).toEqual({ ok: false, reason: "unavailable" });
    expect(await buildEstimatesReader(make, async () => { throw new Error("db"); })("t")).toEqual({ ok: false, reason: "unavailable" });
    expect(make).not.toHaveBeenCalled();
  });

  it("is unavailable when the runtime cannot start", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await buildEstimatesReader(() => { throw new Error("env"); }, async () => true)("t")).toEqual({ ok: false, reason: "unavailable" });
  });
});
