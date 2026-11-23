import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomValueDetail, CustomValueRead, CustomValueWriteOutcome } from "@/features/highlevel";
import { saveCustomValues, type SaveDeps } from "@/features/settings-write-back";
import { saveProblem } from "../../../src/features/settings/api/save-summary";
import { createCustomValueAdapter } from "../../../src/features/highlevel/api/custom-value-write";

// Mocked HighLevel and database only. All values are fake.
const detail = (key: string, value: string): CustomValueDetail => ({ id: `id-${key}`, key, name: `Name ${key}`, value });

function deps(rows: CustomValueDetail[], options: { fail?: Record<string, CustomValueWriteOutcome>; duplicates?: { key: string; value: string }[] } = {}) {
  const store = new Map(rows.map((row) => [row.key, { ...row }]));
  let audits = 0;
  return {
    store,
    read: vi.fn<SaveDeps["read"]>(async () => ({
      ok: true,
      values: [...store.values()].map((row) => ({ ...row })),
      ...(options.duplicates ? { duplicates: options.duplicates } : {}),
    }) as CustomValueRead),
    update: vi.fn<SaveDeps["update"]>(async (_tenant, target, value) => {
      const failed = options.fail?.[target.key];
      if (failed) return failed;
      (store.get(target.key) as CustomValueDetail).value = value;
      return "saved";
    }),
    begin: vi.fn<SaveDeps["begin"]>(async () => `audit-${(audits += 1)}`),
    finish: vi.fn<SaveDeps["finish"]>(async () => {}),
    invalidate: vi.fn<SaveDeps["invalidate"]>(),
    claim: vi.fn<SaveDeps["claim"]>(async () => "holder"),
    release: vi.fn<SaveDeps["release"]>(async () => {}),
    now: vi.fn<SaveDeps["now"]>(() => 0),
  };
}
const save = (d: SaveDeps, changes: { key: string; expected: string; value: string }[]) =>
  saveCustomValues({ tenantId: "T1", actorId: "U1", changes }, d);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("S1: the contrast rule on a stored 3-digit color", () => {
  it("refuses a pale main color against a stored #fff text color", async () => {
    const d = deps([detail("main_color", "#111111"), detail("text_on_main_color", "#fff")]);
    const out = await save(d, [{ key: "main_color", expected: "#111111", value: "#EEEEEE" }]);
    expect(out.results[0].status).toBe("invalid");
    expect(d.update).not.toHaveBeenCalled();
  });
});

describe("S3: a pair restore never blanks a value", () => {
  it("leaves the first color and reports it unconfirmed when its old value was empty", async () => {
    const d = deps([detail("main_color", ""), detail("text_on_main_color", "#FFFFFF")], { fail: { text_on_main_color: "rejected" } });
    const out = await save(d, [
      { key: "main_color", expected: "", value: "#222222" },
      { key: "text_on_main_color", expected: "#FFFFFF", value: "#EEEEEE" },
    ]);
    expect(d.update.mock.calls.some(([, , value]) => value.trim() === "")).toBe(false);
    expect(d.store.get("main_color")?.value).toBe("#222222");
    expect(out.results[0].status).toBe("unknown");
  });
});

describe("S4: a key listed twice", () => {
  const row = (id: string, value: string) => ({ id, name: "Phone", fieldKey: "{{ custom_values.business_phone_number }}", value, locationId: "loc-a" });
  const adapter = (customValues: unknown[]) => createCustomValueAdapter({
    readLocationId: async () => "loc-a",
    getLocationToken: async () => "token",
    requestList: async () => new Response(JSON.stringify({ customValues }), { status: 200 }),
    requestUpdate: async () => new Response("{}", { status: 200 }),
  });

  it("the read names it, with the first row's value, and offers no row to write", async () => {
    const answer = await adapter([row("v1", "111"), row("v2", "222")]).read("t");
    expect(answer).toEqual({ ok: true, values: [], duplicates: [{ key: "business_phone_number", value: "111" }] });
  });

  it("is never written, and gets its own status and message", async () => {
    const d = deps([detail("business_email", "a@b.test")], { duplicates: [{ key: "business_phone_number", value: "111" }] });
    const out = await save(d, [{ key: "business_phone_number", expected: "111", value: "333" }]);
    expect(out.results[0].status).toBe("duplicate");
    expect(d.update).not.toHaveBeenCalled();
    expect(saveProblem(out.results)).toBe("Phone is listed twice in your account, so it was not saved. Ask Forge Forward to fix it.");
  });
});

describe("S7: the color pair on the first pass", () => {
  const pair = [
    { key: "main_color", expected: "#111111", value: "#222222" },
    { key: "text_on_main_color", expected: "#FFFFFF", value: "#EEEEEE" },
  ];

  it("does not write one side when the other changed in HighLevel", async () => {
    const d = deps([detail("main_color", "#111111"), detail("text_on_main_color", "#ABCDEF")]);
    const out = await save(d, pair);
    expect(out.results.map((r) => r.status)).toEqual(["retry", "conflict"]);
    expect(d.update).not.toHaveBeenCalled();
  });

  it("does not write one side when the other is refused", async () => {
    const d = deps([detail("main_color", "#111111"), detail("text_on_main_color", "#FFFFFF")]);
    const out = await save(d, [pair[0], { ...pair[1], value: "not-a-color" }]);
    expect(out.results.map((r) => r.status)).toEqual(["retry", "invalid"]);
    expect(d.update).not.toHaveBeenCalled();
  });

  it("still writes one side when the other already holds the wanted value", async () => {
    const d = deps([detail("main_color", "#111111"), detail("text_on_main_color", "#EEEEEE")]);
    const out = await save(d, pair);
    expect(out.results.map((r) => r.status)).toEqual(["saved", "unchanged"]);
  });
});
