import { describe, expect, it, vi } from "vitest";
import type { CustomValueRead, CustomValueWriteOutcome } from "@/features/highlevel";
import { saveCustomValues, type SaveDeps } from "@/features/settings-write-back";

// A write HighLevel never answered can still land. A third value read back then is not "what the
// account holds now" for good, so the result carries no `current`: the owner gets "could not confirm"
// and the page does not move its baseline. Mocked HighLevel and database; all values are fake.
type Rows = Record<string, string>;
const answer = (rows: Rows): CustomValueRead => ({
  ok: true,
  values: Object.entries(rows).map(([key, value], i) => ({ id: `id-${i}`, key, name: key, value })),
});

function deps(reads: Rows[], update: (key: string, value: string) => CustomValueWriteOutcome): SaveDeps {
  const queue = reads.map(answer);
  const last = queue[queue.length - 1];
  let audit = 0;
  return {
    read: vi.fn(async () => queue.shift() ?? last),
    update: vi.fn(async (_tenant, target, value) => update(target.key, value)),
    begin: vi.fn(async () => `audit-${(audit += 1)}`),
    finish: vi.fn(async () => {}),
    invalidate: vi.fn(),
    claim: vi.fn(async () => "holder"),
    release: vi.fn(async () => {}),
    now: vi.fn(() => 0),
    wait: vi.fn(async () => {}),
  };
}

describe("a third value after a write with no answer", () => {
  it("stays unknown with no current value for one field", async () => {
    const d = deps([{ business_phone_number: "111" }, { business_phone_number: "333" }], () => "no_answer");
    const { results } = await saveCustomValues({ tenantId: "T1", actorId: "U1", changes: [{ key: "business_phone_number", expected: "111", value: "222" }] }, d);
    expect(results).toEqual([{ key: "business_phone_number", status: "unknown" }]);
  });

  it("still carries the third value when HighLevel answered the write", async () => {
    const d = deps([{ business_phone_number: "111" }, { business_phone_number: "333" }], () => "retry");
    const { results } = await saveCustomValues({ tenantId: "T1", actorId: "U1", changes: [{ key: "business_phone_number", expected: "111", value: "222" }] }, d);
    expect(results).toEqual([{ key: "business_phone_number", status: "unknown", current: "333" }]);
  });

  const OLD = { main_color: "#111111", text_on_main_color: "#FFFFFF" };
  const pair = [
    { key: "main_color", expected: "#111111", value: "#222222" },
    { key: "text_on_main_color", expected: "#FFFFFF", value: "#EEEEEE" },
  ];

  it("carries no current value for a color whose own write had no answer", async () => {
    const d = deps(
      [OLD, OLD, { main_color: "#333333", text_on_main_color: "#444444" }],
      (key) => (key === "text_on_main_color" ? "no_answer" : "saved"),
    );
    const { results } = await saveCustomValues({ tenantId: "T1", actorId: "U1", changes: pair }, d);
    const text = results.find((r) => r.key === "text_on_main_color");
    expect(text).toEqual({ key: "text_on_main_color", status: "unknown" });
  });

  it("carries no current value when the restore had no answer", async () => {
    const d = deps(
      [OLD, { main_color: "#222222", text_on_main_color: "#FFFFFF" }, { main_color: "#333333", text_on_main_color: "#FFFFFF" }],
      (key, value) => (key === "text_on_main_color" ? "rejected" : value === "#111111" ? "no_answer" : "saved"),
    );
    const { results } = await saveCustomValues({ tenantId: "T1", actorId: "U1", changes: pair }, d);
    const main = results.find((r) => r.key === "main_color");
    expect(main).toEqual({ key: "main_color", status: "unknown" });
  });
});
