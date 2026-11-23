import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKFLOWS_PAGE_SIZE,
  WORKFLOWS_READ_DEADLINE_MS,
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
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const rows = (count: number, prefix = "w") => Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, name: "Flow", status: "draft" }));
const deps = (search: WorkflowRequests["search"]) => ({
  readLocationId: async () => LOCATION,
  withToken: async (_tenant: string, call: (token: string) => Promise<Response>) => call("token-test"),
  requests: { search },
});
const answers = (...bodies: unknown[]) => vi.fn<WorkflowRequests["search"]>(async () => json(bodies.shift()));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("completeness", () => {
  it("is not complete for a full page with no cursor and no total", async () => {
    const out = await readWorkflows(deps(answers({ workflows: rows(WORKFLOWS_PAGE_SIZE) })), "tenant-a");
    expect(out).toMatchObject({ ok: true, complete: false });
  });

  it("is complete for a short page with no cursor and no total", async () => {
    const out = await readWorkflows(deps(answers({ workflows: rows(WORKFLOWS_PAGE_SIZE - 1) })), "tenant-a");
    expect(out).toMatchObject({ ok: true, complete: true });
  });

  it("is not complete when the total is 0 but rows arrived", async () => {
    const out = await readWorkflows(deps(answers({ total: 0, workflows: rows(2) })), "tenant-a");
    expect(out).toMatchObject({ ok: true, complete: false });
  });

  it("is complete when the total matches what arrived over several pages", async () => {
    const out = await readWorkflows(deps(answers({ total: 3, workflows: rows(2), searchAfter: ["c1"] }, { total: 3, workflows: rows(1, "x") })), "tenant-a");
    expect(out).toMatchObject({ ok: true, complete: true });
  });
});

describe("foreign rows", () => {
  it("counts a foreign row apart and still drops it", () => {
    const out = parseWorkflowSearch({ workflows: [{ id: "w1", locationId: LOCATION }, { id: "w2", locationId: "loc-other" }, { name: "No id" }] }, LOCATION);
    expect(out.workflows.map((w) => w.id)).toEqual(["w1"]);
    expect(out.dropped).toBe(2);
    expect(out.foreign).toBe(1);
  });

  it("counts a foreign row that has no id or sits past the page size", () => {
    const list = [...rows(WORKFLOWS_PAGE_SIZE), { id: "late", locationId: "loc-other" }];
    expect(parseWorkflowSearch({ workflows: list }, LOCATION).foreign).toBe(1);
    expect(parseWorkflowSearch({ workflows: [{ locationId: "loc-other" }] }, LOCATION).foreign).toBe(1);
  });

  it("adds foreign rows up across pages", async () => {
    const out = await readWorkflows(deps(answers(
      { workflows: [{ id: "w1", locationId: "loc-other" }], searchAfter: ["c1"] },
      { workflows: [{ id: "w2", locationId: "loc-other" }, { id: "w3" }] },
    )), "tenant-a");
    expect(out).toMatchObject({ ok: true, foreign: 2 });
  });
});

describe("field limits", () => {
  it("treats an id over 128 characters as malformed", () => {
    const out = parseWorkflowSearch({ workflows: [{ id: "a".repeat(129) }, { id: "b".repeat(128) }] }, LOCATION);
    expect(out.workflows.map((w) => w.id)).toEqual(["b".repeat(128)]);
    expect(out.dropped).toBe(1);
  });

  it("cuts a name to 200 characters without splitting a character", () => {
    const plain = parseWorkflowSearch({ workflows: [{ id: "w1", name: "n".repeat(201) }] }, LOCATION);
    expect(plain.workflows[0].name).toBe("n".repeat(200));
    const emoji = parseWorkflowSearch({ workflows: [{ id: "w1", name: `${"n".repeat(199)}\u{1F600}` }] }, LOCATION);
    expect(emoji.workflows[0].name).toBe("n".repeat(199));
  });
});

describe("request options", () => {
  it("refuses a redirect", async () => {
    const doFetch = vi.fn(async () => json({ workflows: [] })) as unknown as typeof fetch;
    await createWorkflowRequests("https://api.example.test", doFetch).search("token-test", LOCATION);
    const init = (vi.mocked(doFetch).mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.redirect).toBe("error");
  });
});

describe("overall deadline", () => {
  it("is about 25 seconds", () => {
    expect(WORKFLOWS_READ_DEADLINE_MS).toBe(25_000);
  });

  it("is shared across pages and returns unavailable when it expires", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let n = 0;
    const search = vi.fn<WorkflowRequests["search"]>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      n += 1;
      return json({ workflows: [{ id: `w${n}` }], searchAfter: [`c${n}`] });
    });
    const pending = readWorkflows(deps(search), "tenant-a");
    await vi.advanceTimersByTimeAsync(WORKFLOWS_READ_DEADLINE_MS);
    expect(await pending).toEqual({ ok: false, reason: "unavailable" });
    expect(search).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(search).toHaveBeenCalledTimes(3);
  });

  it("aborts the request in flight", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    let signal: AbortSignal | undefined;
    const doFetch = vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;
    const pending = readWorkflows({ ...deps(vi.fn()), requests: createWorkflowRequests("https://api.example.test", doFetch) }, "tenant-a");
    await vi.advanceTimersByTimeAsync(WORKFLOWS_READ_DEADLINE_MS);
    expect(await pending).toEqual({ ok: false, reason: "unavailable" });
    expect(signal?.aborted).toBe(true);
  });
});

describe("limiter per page", () => {
  const runtime = (search: WorkflowRequests["search"]): WorkflowRuntime => ({
    readLocationId: async () => LOCATION,
    withLocationToken: async (_t, call) => call("tenant-token"),
    withStoredLocationToken: async (_t, call) => call("stored-token"),
    requests: { search },
  });
  const twoPages = () => answers({ total: 2, workflows: rows(1), searchAfter: ["c1"] }, { total: 2, workflows: rows(1, "x") });

  it("charges the same key once for each page fetched", async () => {
    const hit = vi.fn(async () => true);
    const out = await buildWorkflowsReader(() => runtime(twoPages()), hit)("tenant-a");
    expect(out).toMatchObject({ ok: true, complete: true });
    expect(hit).toHaveBeenCalledTimes(2);
    for (const call of hit.mock.calls as unknown[][]) expect(call.slice(0, 3)).toEqual(["highlevel-workflows:tenant-a", WORKFLOWS_READS_PER_MINUTE, 60_000]);
  });

  it("stops without fetching the next page when the limit is reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const search = twoPages();
    const hit = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await buildWorkflowsReader(() => runtime(search), hit)("tenant-a")).toEqual({ ok: false, reason: "unavailable" });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("stops without fetching the next page when the limiter fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const search = twoPages();
    const hit = vi.fn<() => Promise<boolean>>().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error("db"));
    expect(await buildWorkflowsReader(() => runtime(search), hit)("tenant-a")).toEqual({ ok: false, reason: "unavailable" });
    expect(search).toHaveBeenCalledTimes(1);
  });
});
