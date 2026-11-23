import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HighLevelHttpError, MAX_PIPELINE_RESPONSE_BYTES, PIPELINE_MAX_PAGES, PIPELINE_PAGE_SIZE, PIPELINE_READS_PER_MINUTE, TokenServiceError,
  createPipelineReaderFrom, createPipelineRequests, parseOpportunityPage, parsePipelines, readPipelineBoard,
} from "@/features/highlevel";

// Fixtures follow the documented shape (OpenAPI apps/opportunities.json, hl-api-notes.md). The real
// response has not been seen. All values are fake.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const stage = (id: string, position?: number) => ({ id, name: `Stage ${id}`, ...(position === undefined ? {} : { position }) });
const pipeline = (over: Record<string, unknown> = {}) => ({ id: "p1", name: "Sales", locationId: "loc-a", stages: [stage("s1", 0), stage("s2", 1)], ...over });
const opp = (over: Record<string, unknown> = {}) => ({
  id: "o1", name: "Fake job", locationId: "loc-a", pipelineId: "p1", pipelineStageId: "s1", status: "open", monetaryValue: 500,
  lastStageChangeAt: "2026-03-04T10:00:00.000Z", contact: { id: "c1", name: "Pat Test", email: "pat@example.test", phone: "+15550100" }, ...over,
});

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorLog.mockRestore());

describe("createPipelineRequests", () => {
  it("only sends GET requests, with the documented parameter names, bearer token and Version", async () => {
    const fetch = vi.fn(async () => json({}));
    const requests = createPipelineRequests({ baseUrl: "https://hl.example.test/", fetch });
    await requests.requestPipelines("tok", "loc-a");
    await requests.requestOpportunities("tok", { locationId: "loc-a", pipelineId: "p 1", page: 2, limit: 100 });
    const calls = fetch.mock.calls as unknown as [string, RequestInit & { headers: Record<string, string> }][];
    expect(calls[0][0]).toBe("https://hl.example.test/opportunities/pipelines?locationId=loc-a");
    const search = new URL(calls[1][0]);
    expect(search.pathname).toBe("/opportunities/search");
    expect(Object.fromEntries(search.searchParams)).toEqual({ location_id: "loc-a", pipeline_id: "p 1", status: "open", page: "2", limit: "100" });
    for (const [, init] of calls) {
      expect(init.method).toBe("GET");
      expect(init.body).toBeUndefined();
      expect(init.headers).toMatchObject({ authorization: "Bearer tok", version: "2021-07-28" });
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("turns a network failure into an error with no status and no detail", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("secret detail");
    });
    const error = await createPipelineRequests({ baseUrl: "https://hl.example.test", fetch }).requestPipelines("tok", "loc-a").catch((e) => e);
    expect(error).toBeInstanceOf(HighLevelHttpError);
    expect(error.status).toBeNull();
    expect(error.message).not.toContain("secret");
  });
});

describe("parsePipelines", () => {
  it("keeps ids and names as the tenant has them, in stage position order", () => {
    const out = parsePipelines({ pipelines: [pipeline({ stages: [stage("late", 5), stage("early", 1)], extra: 1 })] }, "loc-a");
    expect(out).toEqual({ dropped: 0, pipelines: [{ id: "p1", name: "Sales", stages: [{ id: "early", name: "Stage early" }, { id: "late", name: "Stage late" }] }] });
  });

  it("keeps the response order when a stage has no position", () => {
    const out = parsePipelines({ pipelines: [pipeline({ stages: [stage("b"), stage("a", 0)] })] }, "loc-a");
    expect(out.pipelines[0].stages.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("drops and counts malformed pipelines, duplicates, another location and pipelines without a usable stage", () => {
    const out = parsePipelines({ pipelines: [pipeline(), null, pipeline({ id: "" }), pipeline(), pipeline({ id: "x", locationId: "loc-b" }), pipeline({ id: "y", stages: [{ id: "only-id" }] }), pipeline({ id: "z", stages: "no" })] }, "loc-a");
    expect(out.pipelines.map((p) => p.id)).toEqual(["p1"]);
    expect(out.dropped).toBe(6);
  });

  it.each([[null], [[]], [{}], [{ pipelines: "no" }]])("throws on an answer without a pipelines list: %j", (body) => {
    expect(() => parsePipelines(body, "loc-a")).toThrow(/unexpected/);
  });
});

describe("parseOpportunityPage", () => {
  const target = { id: "p1", name: "Sales", stages: [{ id: "s1", name: "One" }, { id: "s2", name: "Two" }] };

  it("keeps the known fields and never carries a phone or an email", () => {
    const page = parseOpportunityPage({ opportunities: [opp()], meta: { total: 1 } }, "loc-a", target, 1, 100, 0);
    expect(page.rows).toEqual([{ id: "o1", name: "Fake job", contactName: "Pat Test", stageId: "s1", monetaryValue: 500, lastStageChangeAt: "2026-03-04T10:00:00.000Z" }]);
    expect(JSON.stringify(page)).not.toMatch(/5550100|example\.test/);
    expect(page).toMatchObject({ dropped: 0, more: false, complete: true });
  });

  it("reads a wrong type in an optional field as missing", () => {
    const page = parseOpportunityPage({ opportunities: [opp({ name: 7, contact: "x", monetaryValue: "500", lastStageChangeAt: "not a date" })], meta: { total: 1 } }, "loc-a", target, 1, 100, 0);
    expect(page.rows[0]).toMatchObject({ name: null, contactName: null, monetaryValue: null, lastStageChangeAt: null });
  });

  it("drops rows of another location, another pipeline, an unknown stage, a closed status or no id", () => {
    const page = parseOpportunityPage({
      opportunities: [opp(), null, opp({ id: "" }), opp({ id: "a", locationId: "loc-b" }), opp({ id: "b", pipelineId: "p2" }), opp({ id: "c", pipelineStageId: "gone" }), opp({ id: "d", status: "won" })],
      meta: { total: 7 },
    }, "loc-a", target, 1, 100, 0);
    expect(page.rows.map((r) => r.id)).toEqual(["o1"]);
    expect(page.dropped).toBe(6);
  });

  it.each([
    ["next page", { nextPage: 2, total: 3 }, 2, true, false],
    ["last page by total", { nextPage: null, total: 2 }, 2, false, true],
    ["no next page but total above the rows", { nextPage: null, total: 9 }, 2, false, false],
    ["no meta, short page", undefined, 1, false, true],
    ["no meta, full page", undefined, 2, false, false],
    ["a next page that does not advance", { nextPage: 1, total: 9 }, 2, false, false],
  ])("paging: %s", (_name, meta, rows, more, complete) => {
    const opportunities = Array.from({ length: rows }, (_, i) => opp({ id: `o${i}` }));
    expect(parseOpportunityPage({ opportunities, meta }, "loc-a", target, 1, 2, 0)).toMatchObject({ more, complete });
  });

  it.each([[null], [{}], [{ opportunities: "no" }]])("throws on an answer without a list: %j", (body) => {
    expect(() => parseOpportunityPage(body, "loc-a", target, 1, 100, 0)).toThrow(/unexpected/);
  });
});

describe("readPipelineBoard", () => {
  const deps = (over: Partial<Record<"pipelines" | "opportunities", () => Promise<Response>>> = {}, locationId: string | null = "loc-a") => ({
    readLocationId: vi.fn(async () => locationId),
    withToken: vi.fn(async (_tenant: string, call: (token: string) => Promise<Response>) => call("tok")),
    requestPipelines: vi.fn(over.pipelines ?? (async () => json({ pipelines: [pipeline(), pipeline({ id: "p2", name: "Other", stages: [stage("t1", 0)] })] }))),
    requestOpportunities: vi.fn(over.opportunities ?? (async () => json({ opportunities: [opp()], meta: { total: 1 } }))),
  });

  it("looks the pipelines up for this tenant and reads the first one by default", async () => {
    const d = deps();
    const out = await readPipelineBoard(d, "tenant-a");
    expect(out).toMatchObject({ ok: true, pipelineId: "p1", dropped: 0, complete: true });
    expect(d.readLocationId.mock.calls).toEqual([["tenant-a"]]);
    expect(d.withToken.mock.calls.every((c) => c[0] === "tenant-a")).toBe(true);
    expect(d.requestOpportunities).toHaveBeenCalledWith("tok", { locationId: "loc-a", pipelineId: "p1", page: 1, limit: PIPELINE_PAGE_SIZE });
  });

  it("uses a requested pipeline only when this tenant has it", async () => {
    const own = deps({ opportunities: async () => json({ opportunities: [], meta: { total: 0 } }) });
    expect(await readPipelineBoard(own, "t", "p2")).toMatchObject({ ok: true, pipelineId: "p2" });
    const foreign = deps({ opportunities: async () => json({ opportunities: [], meta: { total: 0 } }) });
    expect(await readPipelineBoard(foreign, "t", "someone-elses")).toMatchObject({ ok: true, pipelineId: "p1" });
    expect(foreign.requestOpportunities).toHaveBeenCalledWith("tok", expect.objectContaining({ pipelineId: "p1" }));
  });

  it("answers with no pipeline and reads no opportunities when the tenant has none", async () => {
    const d = deps({ pipelines: async () => json({ pipelines: [] }) });
    expect(await readPipelineBoard(d, "t")).toEqual({ ok: true, pipelines: [], pipelineId: null, opportunities: [], dropped: 0, complete: true });
    expect(d.requestOpportunities).not.toHaveBeenCalled();
  });

  it("follows pages up to the cap, then says the list is cut off", async () => {
    let n = 0;
    const d = deps({
      opportunities: async () => {
        n += 1;
        return json({ opportunities: [opp({ id: `o${n}` })], meta: { nextPage: n + 1, total: 99 } });
      },
    });
    const out = await readPipelineBoard(d, "t");
    expect(d.requestOpportunities).toHaveBeenCalledTimes(PIPELINE_MAX_PAGES);
    expect(out).toMatchObject({ ok: true, complete: false });
    expect(out.ok && out.opportunities).toHaveLength(PIPELINE_MAX_PAGES);
  });

  it("counts a row repeated on a later page once", async () => {
    let n = 0;
    const d = deps({
      opportunities: async () => {
        n += 1;
        return json({ opportunities: [opp()], meta: n === 1 ? { nextPage: 2, total: 2 } : { nextPage: null, total: 2 } });
      },
    });
    const out = await readPipelineBoard(d, "t");
    expect(out).toMatchObject({ ok: true, dropped: 1 });
    expect(out.ok && out.opportunities).toHaveLength(1);
  });

  it("asks for reconnect when the tenant has no location, without calling HighLevel", async () => {
    const d = deps({}, null);
    expect(await readPipelineBoard(d, "t")).toEqual({ ok: false, reason: "reconnect" });
    expect(d.requestPipelines).not.toHaveBeenCalled();
  });

  it.each([
    ["not_connected", "reconnect"], ["needs_reconnect", "reconnect"], ["agency_unavailable", "reconnect"], ["unavailable", "unavailable"],
  ] as const)("token error %s becomes %s", async (code, reason) => {
    const d = deps();
    d.withToken.mockRejectedValue(new TokenServiceError(code));
    expect(await readPipelineBoard(d, "t")).toEqual({ ok: false, reason });
  });

  it.each([[401, "reconnect"], [403, "unavailable"], [400, "unavailable"], [422, "unavailable"], [429, "unavailable"], [500, "unavailable"]])("HTTP %i on either call becomes %s, with no retry and no body in the log", async (status, reason) => {
    const a = deps({ pipelines: async () => json({ message: "Pat Test secret" }, status) });
    expect(await readPipelineBoard(a, "t")).toEqual({ ok: false, reason });
    expect(a.requestPipelines).toHaveBeenCalledTimes(1);
    const b = deps({ opportunities: async () => json({ message: "Pat Test secret" }, status) });
    expect(await readPipelineBoard(b, "t")).toEqual({ ok: false, reason });
    expect(b.requestOpportunities).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("Pat Test");
  });

  it("an unreadable answer is unavailable", async () => {
    expect(await readPipelineBoard(deps({ pipelines: async () => new Response("<html>") }), "t")).toEqual({ ok: false, reason: "unavailable" });
    expect(await readPipelineBoard(deps({ opportunities: async () => json({ nope: 1 }) }), "t")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("rejects a declared oversized body without reading it", async () => {
    const cancel = vi.fn();
    const pull = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const headers = { "content-length": String(MAX_PIPELINE_RESPONSE_BYTES + 1) };
    expect(await readPipelineBoard(deps({ pipelines: async () => new Response(body, { status: 200, headers }) }), "t")).toEqual({ ok: false, reason: "unavailable" });
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });
});

describe("createPipelineReaderFrom", () => {
  const services = () => ({
    readLocationId: vi.fn(async () => "loc-a"),
    withLocationToken: vi.fn(async (_tenant: string, call: (token: string) => Promise<Response>) => call("live-token")),
    withStoredLocationToken: vi.fn(async (_tenant: string, call: (token: string) => Promise<Response>) => call("stored-token")),
    requestPipelines: vi.fn(async () => json({ pipelines: [pipeline()] })),
    requestOpportunities: vi.fn(async () => json({ opportunities: [opp()], meta: { total: 1 } })),
  });

  it("a normal read counts against the tenant and uses the refreshing token path", async () => {
    const s = services();
    const hit = vi.fn(async () => true);
    expect(await createPipelineReaderFrom(() => s, hit)("tenant-a")).toMatchObject({ ok: true });
    expect(PIPELINE_READS_PER_MINUTE).toBe(60);
    expect(hit).toHaveBeenCalledWith("highlevel-pipeline:tenant-a", 60, 60_000, expect.any(Date));
    expect(s.withLocationToken).toHaveBeenCalled();
    expect(s.withStoredLocationToken).not.toHaveBeenCalled();
  });

  it("an admin's client view never calls withLocationToken and counts against the viewer, not the client", async () => {
    const s = services();
    const hit = vi.fn(async () => true);
    expect(await createPipelineReaderFrom(() => s, hit, { viewerId: "admin-1" })("tenant-a")).toMatchObject({ ok: true });
    expect(hit).toHaveBeenCalledTimes(1);
    expect(hit).toHaveBeenCalledWith("highlevel-pipeline-view:admin-1", 60, 60_000, expect.any(Date));
    expect(s.withLocationToken).not.toHaveBeenCalled();
    expect(s.withStoredLocationToken).toHaveBeenCalled();
    expect(s.withStoredLocationToken.mock.calls.every((c) => c[0] === "tenant-a")).toBe(true);
  });

  it("an admin's client view with no usable stored token is unavailable", async () => {
    const s = services();
    s.withStoredLocationToken.mockRejectedValue(new TokenServiceError("unavailable"));
    expect(await createPipelineReaderFrom(() => s, async () => true, { viewerId: "admin-1" })("tenant-a")).toEqual({ ok: false, reason: "unavailable" });
    expect(s.withLocationToken).not.toHaveBeenCalled();
    expect(s.requestPipelines).not.toHaveBeenCalled();
  });

  it("over the limit, or with a failing limiter, it never builds services or reads", async () => {
    const build = vi.fn(services);
    expect(await createPipelineReaderFrom(build, async () => false)("t")).toEqual({ ok: false, reason: "unavailable" });
    expect(await createPipelineReaderFrom(build, async () => {
      throw new Error("db secret detail");
    })("t")).toEqual({ ok: false, reason: "unavailable" });
    expect(build).not.toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret");
  });

  it("a missing environment is unavailable", async () => {
    const out = await createPipelineReaderFrom(() => {
      throw new Error("GHL_CLIENT_SECRET missing");
    }, async () => true)("t");
    expect(out).toEqual({ ok: false, reason: "unavailable" });
  });
});
