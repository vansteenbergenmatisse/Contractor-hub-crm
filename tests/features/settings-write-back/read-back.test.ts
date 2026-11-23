import { describe, expect, it, vi } from "vitest";
import type { CustomValueRead, CustomValueWriteOutcome } from "@/features/highlevel";
import { saveCustomValues, type SaveDeps } from "@/features/settings-write-back";

// The confirming read after a write. Mocked HighLevel and database; all values are fake.
const row = (value: string) => ({ id: "id-1", key: "business_phone_number", name: "Phone", value });
const answer = (value: string): CustomValueRead => ({ ok: true, values: [row(value)] });

function deps(reads: CustomValueRead[], http: CustomValueWriteOutcome = "saved") {
  const queue = [...reads];
  const last = reads[reads.length - 1];
  return {
    read: vi.fn<SaveDeps["read"]>(async () => queue.shift() ?? last),
    update: vi.fn<SaveDeps["update"]>(async () => http),
    begin: vi.fn<SaveDeps["begin"]>(async () => "audit-1"),
    finish: vi.fn<SaveDeps["finish"]>(async () => {}),
    invalidate: vi.fn<SaveDeps["invalidate"]>(),
    claim: vi.fn<SaveDeps["claim"]>(async () => "holder"),
    release: vi.fn<SaveDeps["release"]>(async () => {}),
    now: vi.fn<SaveDeps["now"]>(() => 0),
    wait: vi.fn<NonNullable<SaveDeps["wait"]>>(async () => {}),
  };
}
const save = (d: SaveDeps) =>
  saveCustomValues({ tenantId: "T1", actorId: "U1", changes: [{ key: "business_phone_number", expected: "111", value: "222" }] }, d);

describe("confirming a write", () => {
  it("is saved when a later fresh read shows the value after a lagging one", async () => {
    const d = deps([answer("111"), answer("111"), answer("222")]);
    expect((await save(d)).results[0].status).toBe("saved");
    expect(d.finish).toHaveBeenCalledWith("audit-1", "saved");
    expect(d.read).toHaveBeenCalledTimes(3);
    expect(d.wait).toHaveBeenCalledTimes(1);
  });

  it("does not wait when the first confirming read shows the value", async () => {
    const d = deps([answer("111"), answer("222")]);
    expect((await save(d)).results[0].status).toBe("saved");
    expect(d.wait).not.toHaveBeenCalled();
  });

  it("stays unknown when no read within the limit shows the value", async () => {
    const d = deps([answer("111")]);
    expect((await save(d)).results[0].status).toBe("unknown");
    expect(d.finish).toHaveBeenCalledWith("audit-1", "unknown");
    expect(d.wait.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("stays unknown when the reads fail, and never counts a failed read as a confirmation", async () => {
    const d = deps([answer("111"), { ok: false, reason: "retry" }]);
    expect((await save(d)).results[0].status).toBe("unknown");
    expect(d.finish).toHaveBeenCalledWith("audit-1", "unknown");
  });

  it("keeps a timeout unknown without polling, and keeps the lease", async () => {
    const d = deps([answer("111")], "no_answer");
    expect((await save(d)).results[0].status).toBe("unknown");
    expect(d.wait).not.toHaveBeenCalled();
    expect(d.release).not.toHaveBeenCalled();
  });

  it("does not poll when another value appeared", async () => {
    const d = deps([answer("111"), answer("333")]);
    expect((await save(d)).results[0].status).toBe("unknown");
    expect(d.wait).not.toHaveBeenCalled();
  });

  it("stops polling when the time limit has passed", async () => {
    const d = deps([answer("111")]);
    d.now.mockReturnValueOnce(0).mockReturnValue(36_000);
    expect((await save(d)).results[0].status).toBe("unknown");
    expect(d.wait).not.toHaveBeenCalled();
  });
});
