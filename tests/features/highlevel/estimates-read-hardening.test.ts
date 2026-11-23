import { afterEach, describe, expect, it, vi } from "vitest";
import { ESTIMATES_PAGE_SIZE, createEstimatesRequests, parseEstimatePage, readEstimates, type EstimatesRequests } from "@/features/highlevel";

// All values are fake.
const LOC = "loc-a";
const raw = (over: Record<string, unknown> = {}) => ({
  _id: "est-1", altId: LOC, altType: "location", name: "Spring cleanup", currency: "USD", total: 10,
  issueDate: "2026-03-04T00:00:00.000Z", status: "sent", deleted: false, contactDetails: { name: "Pat Test" }, ...over,
});
const answer = (estimates: unknown[], total = estimates.length) => new Response(JSON.stringify({ estimates, total }), { status: 200 });
const fullPage = (prefix: string) => Array.from({ length: ESTIMATES_PAGE_SIZE }, (_, i) => raw({ _id: `${prefix}-${i}` }));

function deps(list: EstimatesRequests["list"]) {
  return {
    readLocationId: async () => LOC,
    withToken: async (_tenant: string, call: (token: string) => Promise<Response>) => call("token-a"),
    requests: { list },
  };
}
const pagesOf = (pages: Response[]) => deps(async () => pages.shift() ?? answer([]));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("completeness", () => {
  it("counts a deleted row, so it causes no false incomplete", async () => {
    const out = await readEstimates(pagesOf([answer([raw(), raw({ _id: "est-2", deleted: true })])]), "t");
    expect(out).toMatchObject({ ok: true, complete: true, total: 2 });
    expect(out.ok && out.rows.map((r) => r.id)).toEqual(["est-1"]);
  });

  it("counts a dropped row that has an id", async () => {
    const out = await readEstimates(pagesOf([answer([raw(), raw({ _id: "est-2", altId: undefined })])]), "t");
    expect(out).toMatchObject({ ok: true, complete: true, dropped: 1 });
  });

  it("is not complete when a row has no id to count", async () => {
    const out = await readEstimates(pagesOf([answer([raw(), raw({ _id: "" })])]), "t");
    expect(out).toMatchObject({ ok: true, complete: false, dropped: 1 });
  });

  it("is not complete when an id repeats across pages, even if the row count reaches the total", async () => {
    const total = ESTIMATES_PAGE_SIZE + 1;
    const out = await readEstimates(pagesOf([answer(fullPage("a"), total), answer([raw({ _id: "a-0" })], total)]), "t");
    expect(out).toMatchObject({ ok: true, complete: false });
  });

  it("is not complete when a repeated id is a deleted copy", async () => {
    const total = ESTIMATES_PAGE_SIZE + 1;
    const out = await readEstimates(pagesOf([answer(fullPage("a"), total), answer([raw({ _id: "a-0", deleted: true })], total)]), "t");
    expect(out).toMatchObject({ ok: true, complete: false });
  });
});

describe("foreign rows", () => {
  it("counts rows of another location or owner type apart from other malformed rows", () => {
    const page = parseEstimatePage({ estimates: [raw({ altId: "loc-b" }), raw({ altType: "company" }), raw({ altId: undefined }), "x"], total: 4 }, LOC);
    expect(page.foreign).toBe(2);
    expect(page.dropped).toBe(4);
  });

  it("carries the count through the read", async () => {
    const out = await readEstimates(pagesOf([answer([raw(), raw({ _id: "est-2", altId: "loc-b" })])]), "t");
    expect(out).toMatchObject({ ok: true, foreign: 1 });
  });
});

describe("issue date", () => {
  const issued = (issueDate: unknown) => parseEstimatePage({ estimates: [raw({ issueDate })], total: 1 }, LOC).rows[0].issuedMs;

  it("keeps the written day whatever the offset", () => {
    expect(issued("2026-03-04T23:30:00-05:00")).toBe(Date.UTC(2026, 2, 4));
    expect(issued("2026-03-04T01:00:00+09:00")).toBe(Date.UTC(2026, 2, 4));
  });

  it.each([["2026-02-31T00:00:00Z"], ["2026-13-01T00:00:00Z"], ["Mar 4 2026 10:00 Z"]])("treats %s as missing", (value) => {
    expect(issued(value)).toBeNull();
  });
});

describe("long names", () => {
  const first = (over: Record<string, unknown>) => parseEstimatePage({ estimates: [raw(over)], total: 1 }, LOC).rows[0];

  it("keeps 200 characters and treats 201 as missing", () => {
    expect(first({ name: "n".repeat(200) }).name).toHaveLength(200);
    expect(first({ name: "n".repeat(201) }).name).toBeNull();
    expect(first({ contactDetails: { name: "c".repeat(200) } }).contactName).toHaveLength(200);
    expect(first({ contactDetails: { name: "c".repeat(201) } }).contactName).toBeNull();
  });
});

describe("overall deadline", () => {
  it("is unavailable after about 25s when a request hangs, and aborts it", async () => {
    vi.useFakeTimers();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    const list = vi.fn<EstimatesRequests["list"]>((_token, _query, s) => {
      signal = s;
      return new Promise<Response>(() => {});
    });
    const out = readEstimates(deps(list), "t");
    await vi.advanceTimersByTimeAsync(25_000);
    await expect(out).resolves.toEqual({ ok: false, reason: "unavailable" });
    expect(signal?.aborted).toBe(true);
    expect(log.mock.calls.flat().join(" ")).toContain("step=deadline");
  });

  it("shares one deadline across pages and starts no page after it", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const list = vi.fn<EstimatesRequests["list"]>(async (_token, query) => {
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      return answer(fullPage(`p${query.offset}`), ESTIMATES_PAGE_SIZE * 3);
    });
    const out = readEstimates(deps(list), "t");
    await vi.advanceTimersByTimeAsync(25_000);
    await expect(out).resolves.toEqual({ ok: false, reason: "unavailable" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("leaves no timer behind after a normal read", async () => {
    vi.useFakeTimers();
    await readEstimates(pagesOf([answer([raw()])]), "t");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes the deadline to fetch", async () => {
    const doFetch = vi.fn(async () => answer([])) as unknown as typeof fetch;
    const controller = new AbortController();
    await createEstimatesRequests("https://hl.test", doFetch).list("t", { locationId: LOC, limit: 1, offset: 0 }, controller.signal);
    const init = (doFetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1];
    expect(init.signal?.aborted).toBe(false);
    controller.abort();
    expect(init.signal?.aborted).toBe(true);
  });
});
