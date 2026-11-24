import { describe, expect, it, vi } from "vitest";
import type { CustomValueRead, CustomValueWriteOutcome } from "@/features/highlevel";
import { saveProblem } from "@/features/settings";
import { saveCustomValues, type SaveDeps } from "@/features/settings-write-back";
import { initialState, settingsReducer } from "../../../src/features/settings/api/state";

// After a write, the confirming read shows a value that is neither the one sent nor the old one, or
// cannot be read at all. The owner is told which field and, when known, what HighLevel holds now.
// Mocked HighLevel and database; all values are fake.
const row = (value: string) => ({ id: "id-1", key: "business_phone_number", name: "Phone", value });
const answer = (value: string): CustomValueRead => ({ ok: true, values: [row(value)] });

function deps(reads: CustomValueRead[], http: CustomValueWriteOutcome = "saved"): SaveDeps {
  const queue = [...reads];
  const last = reads[reads.length - 1];
  return {
    read: vi.fn(async () => queue.shift() ?? last),
    update: vi.fn(async () => http),
    begin: vi.fn(async () => "audit-1"),
    finish: vi.fn(async () => {}),
    invalidate: vi.fn(),
    claim: vi.fn(async () => "holder"),
    release: vi.fn(async () => {}),
    now: vi.fn(() => 0),
    wait: vi.fn(async () => {}),
  };
}
const save = (d: SaveDeps) =>
  saveCustomValues({ tenantId: "T1", actorId: "U1", changes: [{ key: "business_phone_number", expected: "111", value: "222" }] }, d);

describe("a third value after the write", () => {
  it("stays unknown and carries what HighLevel holds now", async () => {
    const d = deps([answer("111"), answer("333")]);
    const [result] = (await save(d)).results;
    expect(result.status).toBe("unknown");
    expect(result.current).toBe("333");
    expect(d.finish).toHaveBeenCalledWith("audit-1", "unknown");
  });

  it("carries no current value when the confirming read failed", async () => {
    const [result] = (await save(deps([answer("111"), { ok: false, reason: "retry" }]))).results;
    expect(result.status).toBe("unknown");
    expect(result.current).toBeUndefined();
  });

  it("carries no current value while the old value may still be replaced", async () => {
    const [result] = (await save(deps([answer("111")], "no_answer"))).results;
    expect(result.status).toBe("unknown");
    expect(result.current).toBeUndefined();
  });

  it("still calls a confirmed value saved, with no current value", async () => {
    const [result] = (await save(deps([answer("111"), answer("222")]))).results;
    expect(result).toEqual({ key: "business_phone_number", status: "saved" });
  });
});

describe("the message for an unconfirmed save", () => {
  it("names the field and what the account holds now", () => {
    const text = saveProblem([{ key: "business_phone_number", status: "unknown", current: "333" }]) ?? "";
    expect(text).toContain("Phone");
    expect(text).toContain("333");
    expect(text).not.toMatch(/reload/i);
  });

  it("says when the account now holds an empty value", () => {
    const text = saveProblem([{ key: "business_phone_number", status: "unknown", current: "" }]) ?? "";
    expect(text).toContain("Phone");
    expect(text).toMatch(/empty/i);
  });

  it("keeps the reload advice, naming the field, when nothing could be read", () => {
    const text = saveProblem([{ key: "business_phone_number", status: "unknown" }]) ?? "";
    expect(text).toMatch(/could not confirm Phone/i);
    expect(text).toMatch(/reload/i);
  });
});

describe("the page state after an unconfirmed save", () => {
  it("starts the next save from what the account holds now", () => {
    const s = initialState({ business_phone_number: "111" });
    const next = settingsReducer(s, {
      type: "remoteSaved",
      results: [{ key: "business_phone_number", status: "unknown", current: "333" }],
      submitted: { business_phone_number: "222" },
    });
    expect(next.values.business_phone_number).toBe("333");
    expect(next.ok).toBe(false);
  });

  it("leaves the value alone when nothing could be read", () => {
    const s = initialState({ business_phone_number: "111" });
    const next = settingsReducer(s, {
      type: "remoteSaved",
      results: [{ key: "business_phone_number", status: "unknown" }],
      submitted: { business_phone_number: "222" },
    });
    expect(next.values.business_phone_number).toBe("111");
  });
});
