import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HighLevelHttpError,
  MAX_WORKFLOWS_RESPONSE_BYTES,
  TokenServiceError,
  WORKFLOWS_MAX_PAGES,
  WORKFLOWS_PAGE_SIZE,
  WORKFLOWS_READS_PER_MINUTE,
  buildWorkflowsReader,
  createWorkflowRequests,
  parseWorkflowSearch,
  readWorkflows,
  type WorkflowRequests,
  type WorkflowRuntime,
} from "@/features/highlevel";

// Every value is fake. No test calls HighLevel.
const LOCATION = "loc-test";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const page = (ids: string[], extra: Record<string, unknown> = {}) => ({
  total: ids.length,
  count: ids.length,
  workflows: ids.map((id) => ({ id, name: `Flow ${id}`, status: "published" })),
  ...extra,
});
const requests = (...answers: Array<Response | Error>) => {
  const search = vi.fn<WorkflowRequests["search"]>(async () => {
    const next = answers.shift();
    if (!next) throw new Error("no answer left");
    if (next instanceof Error) throw next;
    return next;
  });
  return { search };
};
const deps = (r: WorkflowRequests, locationId: string | null = LOCATION) => ({
  readLocationId: vi.fn(async () => locationId),
  withToken: vi.fn(async (_tenant: string, call: (token: string) => Promise<Response>) => call("token-test")),
  requests: r,
});

afterEach(() => vi.restoreAllMocks());

describe("createWorkflowRequests", () => {
  it("posts the documented search with locationId in the query and Version v3", async () => {
    const doFetch = vi.fn(async () => json(page([]))) as unknown as typeof fetch;
    await createWorkflowRequests("https://api.example.test/", doFetch).search("token-test", LOCATION);
    const [url, init] = vi.mocked(doFetch).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example.test/workflows/search?locationId=loc-test");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ authorization: "Bearer token-test", version: "v3", "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({ limit: WORKFLOWS_PAGE_SIZE });
  });

  it("sends the cursor back unchanged and never an offset", async () => {
    const doFetch = vi.fn(async () => json(page([]))) as unknown as typeof fetch;
    await createWorkflowRequests("https://api.example.test", doFetch).search("token-test", LOCATION, ["cursor-a", "cursor-b"]);
    const init = (vi.mocked(doFetch).mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({ limit: WORKFLOWS_PAGE_SIZE, searchAfter: ["cursor-a", "cursor-b"] });
  });

  it("hides a network failure behind a status-free error", async () => {
    const doFetch = vi.fn(async () => { throw new Error("secret detail"); }) as unknown as typeof fetch;
    await expect(createWorkflowRequests("https://api.example.test", doFetch).search("token-test", LOCATION)).rejects.toBeInstanceOf(HighLevelHttpError);
  });
});

describe("parseWorkflowSearch", () => {
  it("keeps only id, name and status", () => {
    const out = parseWorkflowSearch({ total: 1, workflows: [{ id: "w1", name: " Follow up ", status: "draft", updatedBy: "user-test", folderId: "f1" }] }, LOCATION);
    expect(out.workflows).toEqual([{ id: "w1", name: "Follow up", status: "draft" }]);
  });

  it("drops a row of another location, a row with no id and a repeated id", () => {
    const out = parseWorkflowSearch({ workflows: [
      { id: "w1", locationId: LOCATION }, { id: "w2", locationId: "loc-other" }, { name: "No id" }, { id: "w1" }, "bad",
    ] }, LOCATION);
    expect(out.workflows.map((w) => w.id)).toEqual(["w1"]);
    expect(out.dropped).toBe(4);
  });

  it("reads a wrongly typed optional field as missing", () => {
    expect(parseWorkflowSearch({ workflows: [{ id: "w1", name: 5, status: {} }] }, LOCATION).workflows).toEqual([{ id: "w1", name: null, status: null }]);
  });

  it("rejects a body without a workflows array and a malformed cursor", () => {
    expect(() => parseWorkflowSearch({}, LOCATION)).toThrow();
    expect(() => parseWorkflowSearch({ workflows: [], searchAfter: "nope" }, LOCATION)).toThrow();
    expect(() => parseWorkflowSearch({ workflows: [], searchAfter: [{}] }, LOCATION)).toThrow();
  });

  it("marks a page longer than was asked for as cut off", () => {
    const ids = Array.from({ length: WORKFLOWS_PAGE_SIZE + 1 }, (_, i) => `w${i}`);
    const out = parseWorkflowSearch(page(ids), LOCATION);
    expect(out.workflows).toHaveLength(WORKFLOWS_PAGE_SIZE);
    expect(out.truncated).toBe(true);
  });
});

describe("readWorkflows", () => {
  it("follows searchAfter until it is absent", async () => {
    const r = requests(json(page(["w1"], { total: 2, searchAfter: ["c1"] })), json(page(["w2"], { total: 2 })));
    const out = await readWorkflows(deps(r), "tenant-a");
    expect(out).toMatchObject({ ok: true, complete: true, dropped: 0 });
    expect(out.ok && out.workflows.map((w) => w.id)).toEqual(["w1", "w2"]);
    expect(r.search.mock.calls[1]).toEqual(["token-test", LOCATION, ["c1"]]);
  });

  it("stops at the page limit and says the list is not complete", async () => {
    const answers = Array.from({ length: WORKFLOWS_MAX_PAGES + 1 }, (_, i) => json(page([`w${i}`], { total: 99, searchAfter: [`c${i}`] })));
    const r = requests(...answers);
    const out = await readWorkflows(deps(r), "tenant-a");
    expect(r.search).toHaveBeenCalledTimes(WORKFLOWS_MAX_PAGES);
    expect(out).toMatchObject({ ok: true, complete: false });
  });

  it("stops on a repeated cursor", async () => {
    const r = requests(json(page(["w1"], { total: 9, searchAfter: ["same"] })), json(page(["w2"], { total: 9, searchAfter: ["same"] })));
    const out = await readWorkflows(deps(r), "tenant-a");
    expect(r.search).toHaveBeenCalledTimes(2);
    expect(out).toMatchObject({ ok: true, complete: false });
  });

  it("is not complete when the total is higher than what arrived", async () => {
    const out = await readWorkflows(deps(requests(json(page(["w1"], { total: 3 })))), "tenant-a");
    expect(out).toMatchObject({ ok: true, complete: false });
  });

  it("reads the documented 403 as not enabled, not as a reconnect", async () => {
    const out = await readWorkflows(deps(requests(json({ statusCode: 403, message: "WORKFLOW_API_NOT_ENABLED_FOR_LOCATION" }, 403))), "tenant-a");
    expect(out).toEqual({ ok: false, reason: "not-enabled" });
  });

  it("finds the code wherever the error body holds it", async () => {
    const out = await readWorkflows(deps(requests(json({ error: { code: "WORKFLOW_API_NOT_ENABLED_FOR_LOCATION" } }, 403))), "tenant-a");
    expect(out).toEqual({ ok: false, reason: "not-enabled" });
  });

  it("reads any other 403 and a 401 as reconnect", async () => {
    expect(await readWorkflows(deps(requests(json({ message: "Forbidden" }, 403))), "tenant-a")).toEqual({ ok: false, reason: "reconnect" });
    expect(await readWorkflows(deps(requests(json({}, 401))), "tenant-a")).toEqual({ ok: false, reason: "reconnect" });
  });

  it("reads a 429, a 500 and a bad body as unavailable, with no retry", async () => {
    for (const answer of [json({}, 429), json({}, 500), new Response("not json")]) {
      const r = requests(answer);
      expect(await readWorkflows(deps(r), "tenant-a")).toEqual({ ok: false, reason: "unavailable" });
      expect(r.search).toHaveBeenCalledTimes(1);
    }
  });

  it("refuses a body over the size cap", async () => {
    const big = new Response("x".repeat(MAX_WORKFLOWS_RESPONSE_BYTES + 1));
    expect(await readWorkflows(deps(requests(big)), "tenant-a")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("asks for a reconnect without a stored location", async () => {
    const r = requests();
    expect(await readWorkflows(deps(r, null), "tenant-a")).toEqual({ ok: false, reason: "reconnect" });
    expect(r.search).not.toHaveBeenCalled();
  });

  it("maps token errors", async () => {
    const d = deps(requests());
    d.withToken.mockRejectedValueOnce(new TokenServiceError("needs_reconnect"));
    expect(await readWorkflows(d, "tenant-a")).toEqual({ ok: false, reason: "reconnect" });
    d.withToken.mockRejectedValueOnce(new TokenServiceError("unavailable"));
    expect(await readWorkflows(d, "tenant-a")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("logs the step and status only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await readWorkflows(deps(requests(json({ message: "Private Name" }, 500))), "tenant-a");
    const written = log.mock.calls.flat().join(" ");
    expect(written).toContain("step=request status=500");
    expect(written).not.toMatch(/Private|tenant-a|loc-test|token-test/);
  });
});

describe("buildWorkflowsReader", () => {
  const runtime = (): WorkflowRuntime => ({
    readLocationId: async () => LOCATION,
    withLocationToken: vi.fn(async (_t, call) => call("tenant-token")),
    withStoredLocationToken: vi.fn(async (_t, call) => call("stored-token")),
    requests: { search: vi.fn(async () => json(page(["w1"]))) },
  });

  it("counts per tenant and uses the renewing token", async () => {
    const rt = runtime();
    const hit = vi.fn(async () => true);
    await buildWorkflowsReader(() => rt, hit)("tenant-a");
    expect((hit.mock.calls[0] as unknown[]).slice(0, 3)).toEqual(["highlevel-workflows:tenant-a", WORKFLOWS_READS_PER_MINUTE, 60_000]);
    expect(rt.withLocationToken).toHaveBeenCalled();
    expect(rt.withStoredLocationToken).not.toHaveBeenCalled();
  });

  it("counts per viewer and uses the stored token in a client view", async () => {
    const rt = runtime();
    const hit = vi.fn(async () => true);
    await buildWorkflowsReader(() => rt, hit, { viewerId: "viewer-a" })("tenant-a");
    expect((hit.mock.calls[0] as unknown[])[0]).toBe("highlevel-workflows-view:viewer-a");
    expect(rt.withStoredLocationToken).toHaveBeenCalled();
    expect(rt.withLocationToken).not.toHaveBeenCalled();
  });

  it("is unavailable when throttled, when the limiter fails or when env is missing, before any call", async () => {
    const rt = runtime();
    expect(await buildWorkflowsReader(() => rt, async () => false)("tenant-a")).toEqual({ ok: false, reason: "unavailable" });
    expect(await buildWorkflowsReader(() => rt, async () => { throw new Error("db"); })("tenant-a")).toEqual({ ok: false, reason: "unavailable" });
    expect(await buildWorkflowsReader(() => { throw new Error("env"); }, async () => true)("tenant-a")).toEqual({ ok: false, reason: "unavailable" });
    expect(rt.requests.search).not.toHaveBeenCalled();
  });
});
