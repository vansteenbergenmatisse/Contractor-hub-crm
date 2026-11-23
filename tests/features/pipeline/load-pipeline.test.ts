import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardChunks, chunkOfStage, loadPipeline, MOCK_CARDS, type PipelineBoardAnswer } from "@/features/pipeline";

// All values are fake.
const NOW = new Date("2026-03-10T12:00:00.000Z");
const pipelines = [
  { id: "p1", name: "Sales", stages: [{ id: "s1", name: "First" }, { id: "s2", name: "Second" }] },
  { id: "p2", name: "Other", stages: [{ id: "t1", name: "Only" }] },
];
const row = (over: Record<string, unknown> = {}) => ({ id: "o1", name: "Fake job", contactName: "Pat Test", stageId: "s1", monetaryValue: 1250.5, lastStageChangeAt: "2026-03-07T11:00:00.000Z", ...over });
const answer = (over: Partial<Extract<PipelineBoardAnswer, { ok: true }>> = {}): PipelineBoardAnswer => ({ ok: true, pipelines, pipelineId: "p1", opportunities: [row()], dropped: 0, complete: true, ...over }) as PipelineBoardAnswer;
const load = (read: () => Promise<PipelineBoardAnswer>, pipelineId?: string) => loadPipeline("tenant-a", read, pipelineId, () => NOW);

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  vi.unstubAllEnvs();
});

describe("loadPipeline", () => {
  it("builds the columns from the tenant's own stages, in order, with the cards in them", async () => {
    const out = await load(async () => answer({ opportunities: [row(), row({ id: "o2", stageId: "s2", name: "Second job", contactName: null, monetaryValue: null, lastStageChangeAt: null })] }));
    if (out.state !== "ready") throw new Error(out.state);
    expect(out.columns.map((c) => [c.id, c.name, c.cards.length])).toEqual([["s1", "First", 1], ["s2", "Second", 1]]);
    expect(out.columns[0].cards[0]).toEqual({ id: "o1", name: "Pat Test", init: "PT", detail: "Fake job", amount: "1,250.5", since: "3 days in this stage" });
    expect(out.columns[1].cards[0]).toEqual({ id: "o2", name: "Second job", init: "SJ", detail: "", amount: "", since: "" });
    expect(out).toMatchObject({ pipelineId: "p1", loadedAt: NOW.toISOString(), complete: true, dropped: 0 });
    expect(out.pipelines).toEqual([{ id: "p1", name: "Sales" }, { id: "p2", name: "Other" }]);
  });

  it("passes the tenant and the requested pipeline to the reader", async () => {
    const read = vi.fn(async () => answer());
    await loadPipeline("tenant-a", read, "p2", () => NOW);
    expect(read).toHaveBeenCalledWith("tenant-a", "p2");
  });

  it.each([
    ["2026-03-10T11:00:00.000Z", "In this stage today"],
    ["2026-03-09T11:00:00.000Z", "1 day in this stage"],
    ["2026-03-11T11:00:00.000Z", ""],
  ])("time in stage for %s", async (lastStageChangeAt, since) => {
    const out = await load(async () => answer({ opportunities: [row({ lastStageChangeAt })] }));
    expect(out.state === "ready" && out.columns[0].cards[0].since).toBe(since);
  });

  it("shows no amount for zero, because an unset value and a real zero cannot be told apart", async () => {
    const out = await load(async () => answer({ opportunities: [row({ monetaryValue: 0 })] }));
    expect(out.state === "ready" && out.columns[0].cards[0].amount).toBe("");
  });

  it("is empty with its pipelines when the pipeline has no open deals, so another one can be picked", async () => {
    expect(await load(async () => answer({ opportunities: [] }))).toEqual({ state: "empty", pipelines: [{ id: "p1", name: "Sales" }, { id: "p2", name: "Other" }], pipelineId: "p1" });
  });

  it("is empty when the tenant has no pipeline", async () => {
    expect(await load(async () => answer({ pipelines: [], pipelineId: null, opportunities: [] }))).toEqual({ state: "empty", pipelines: [], pipelineId: null });
  });

  it("is unavailable when every row was malformed, rather than claiming there are none", async () => {
    expect(await load(async () => answer({ opportunities: [], dropped: 2 }))).toEqual({ state: "unavailable" });
    expect(await load(async () => answer({ pipelines: [], pipelineId: null, opportunities: [], dropped: 1 }))).toEqual({ state: "unavailable" });
  });

  it("logs a count only", async () => {
    await load(async () => answer({ dropped: 2 }));
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Pat Test|Fake job/);
    expect(JSON.stringify(warn.mock.calls)).toContain("2");
  });

  it.each(["reconnect", "unavailable"] as const)("passes the %s failure on", async (reason) => {
    expect(await load(async () => ({ ok: false, reason }))).toEqual({ state: reason });
  });

  it("a reader that throws is unavailable", async () => {
    expect(await load(async () => {
      throw new Error("boom");
    })).toEqual({ state: "unavailable" });
  });

  it("without a tenant it never reads", async () => {
    const read = vi.fn(async () => answer());
    expect(await loadPipeline(null, read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("PIPELINE_READ_DISABLED=true turns the read off", async () => {
    vi.stubEnv("PIPELINE_READ_DISABLED", "true");
    const read = vi.fn(async () => answer());
    expect(await loadPipeline("tenant-a", read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("never returns a sample customer", async () => {
    const text = JSON.stringify(await load(async () => answer()));
    for (const card of MOCK_CARDS) expect(text).not.toContain(card.name);
  });
});

describe("board chunks", () => {
  it("splits any number of stages into groups of up to five columns", () => {
    expect(boardChunks(3)).toEqual([{ first: 0, last: 2 }]);
    expect(boardChunks(5)).toEqual([{ first: 0, last: 4 }]);
    expect(boardChunks(12)).toEqual([{ first: 0, last: 4 }, { first: 5, last: 9 }, { first: 10, last: 11 }]);
    expect(chunkOfStage(7)).toBe(1);
  });
});
