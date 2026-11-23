import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAutomations, type AutomationsReader, type WorkflowRow } from "@/features/automations";

// Every value is fake.
const NOW = new Date("2026-03-04T17:00:00.000Z");
const row = (id: string, status: string | null, name: string | null = `Flow ${id}`): WorkflowRow => ({ id, name, status });
const reader = (workflows: WorkflowRow[], extra: { dropped?: number; complete?: boolean } = {}): AutomationsReader =>
  vi.fn(async () => ({ ok: true as const, workflows, dropped: extra.dropped ?? 0, complete: extra.complete ?? true }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("loadAutomations", () => {
  it("counts published, draft and other statuses without guessing", async () => {
    const out = await loadAutomations("tenant-a", reader([row("1", "published"), row("2", "Draft"), row("3", "paused"), row("4", null)]), () => NOW);
    expect(out).toMatchObject({ state: "ready", totals: { published: 1, draft: 1, all: 4 }, complete: true, loadedAt: NOW.toISOString() });
    expect(out.state === "ready" && out.workflows.map((w) => w.status)).toEqual(["published", "draft", "unknown", "unknown"]);
  });

  it("names an unnamed workflow plainly", async () => {
    const out = await loadAutomations("tenant-a", reader([row("1", "draft", null)]), () => NOW);
    expect(out.state === "ready" && out.workflows[0].name).toBe("Unnamed automation");
  });

  it("is empty only when the whole answer was clean", async () => {
    expect(await loadAutomations("tenant-a", reader([]), () => NOW)).toEqual({ state: "empty" });
    expect(await loadAutomations("tenant-a", reader([], { dropped: 1 }), () => NOW)).toEqual({ state: "unavailable" });
    expect(await loadAutomations("tenant-a", reader([], { complete: false }), () => NOW)).toEqual({ state: "unavailable" });
  });

  it("passes reconnect, unavailable and not-enabled through", async () => {
    for (const reason of ["reconnect", "unavailable", "not-enabled"] as const) {
      expect(await loadAutomations("tenant-a", async () => ({ ok: false, reason }))).toEqual({ state: reason });
    }
  });

  it("is unavailable without a tenant, when the reader throws, and with the kill switch, without reading", async () => {
    const read = reader([row("1", "published")]);
    expect(await loadAutomations(null, read)).toEqual({ state: "unavailable" });
    vi.stubEnv("AUTOMATIONS_READ_DISABLED", "true");
    expect(await loadAutomations("tenant-a", read)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    expect(await loadAutomations("tenant-a", async () => { throw new Error("boom"); })).toEqual({ state: "unavailable" });
  });
});
