import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAutomations } from "@/features/automations";

// Every value is fake.
const workflows = [{ id: "secret-workflow-id", name: "Private Name", status: "published" }];

afterEach(() => vi.restoreAllMocks());

describe("loadAutomations with rows from another location", () => {
  it("is unavailable and logs the count only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await loadAutomations("tenant-a", async () => ({ ok: true as const, workflows, dropped: 2, foreign: 2, complete: true }));
    expect(out).toEqual({ state: "unavailable" });
    const written = log.mock.calls.flat().join(" ");
    expect(written).toContain("2");
    expect(written).not.toMatch(/secret-workflow-id|Private Name|tenant-a/);
  });

  it("stays ready when the foreign count is 0", async () => {
    const out = await loadAutomations("tenant-a", async () => ({ ok: true as const, workflows, dropped: 0, foreign: 0, complete: true }));
    expect(out.state).toBe("ready");
  });
});
