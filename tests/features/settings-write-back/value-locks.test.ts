import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveProblem } from "@/features/settings";
import { saveCustomValues, type SaveDeps } from "@/features/settings-write-back";

// Wave E (2026-11-24): Forge Forward locks keys. A locked key is refused on the owner's save, on the
// server. An admin save (scope "admin") writes any key, secret-looking ones included, and ignores
// locks. Mocked HighLevel and database only. All values are made up.
const detail = (key: string, value: string) => ({ id: `id-${key}`, key, name: `Name ${key}`, value });
const VALUES = [
  detail("business_name", "Test Co"), detail("business_email", "old@example.test"),
  detail("0_webhook_url_form", "https://hooks.example.test/old"), detail("stripe_secret", "madeup-old"),
  detail("business_main_x", "sk_live_madeupold123456"), detail("seasonal_offer_text", "x".repeat(2001)),
];

function deps(locked: readonly string[] | Error = []) {
  const store = new Map(VALUES.map((row) => [row.key, { ...row }]));
  let audits = 0;
  return {
    store,
    read: vi.fn<SaveDeps["read"]>(async () => ({ ok: true, values: [...store.values()].map((row) => ({ ...row })) })),
    update: vi.fn<SaveDeps["update"]>(async (_tenant, target, value) => {
      (store.get(target.key) as { value: string }).value = value;
      return "saved";
    }),
    begin: vi.fn<SaveDeps["begin"]>(async () => `audit-${(audits += 1)}`),
    finish: vi.fn<SaveDeps["finish"]>(async () => {}),
    invalidate: vi.fn<SaveDeps["invalidate"]>(),
    claim: vi.fn<SaveDeps["claim"]>(async () => "holder"),
    release: vi.fn<SaveDeps["release"]>(async () => {}),
    now: vi.fn<SaveDeps["now"]>(() => 0),
    locks: vi.fn<NonNullable<SaveDeps["locks"]>>(async () => {
      if (locked instanceof Error) throw locked;
      return new Set(locked);
    }),
  };
}

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("owner save and locks", () => {
  it("refuses a locked key with status locked and still saves the others", async () => {
    const d = deps(["business_name"]);
    const { results } = await saveCustomValues({ tenantId: "T1", actorId: "U1", changes: [
      { key: "business_name", expected: "Test Co", value: "New Co" },
      { key: "business_email", expected: "old@example.test", value: "new@example.test" },
    ] }, d);
    expect(results).toEqual([{ key: "business_name", status: "locked" }, { key: "business_email", status: "saved" }]);
    expect(d.update).toHaveBeenCalledTimes(1);
    expect(d.locks).toHaveBeenCalledWith("T1");
    expect(d.store.get("business_name")?.value).toBe("Test Co");
  });

  it("writes nothing when the locks cannot be read (fails closed)", async () => {
    const d = deps(new Error("db down"));
    const { results } = await saveCustomValues({ tenantId: "T1", actorId: "U1", changes: [{ key: "business_email", expected: "old@example.test", value: "new@example.test" }] }, d);
    expect(results).toEqual([{ key: "business_email", status: "retry" }]);
    expect(d.update).not.toHaveBeenCalled();
    expect(d.begin).not.toHaveBeenCalled();
    expect(d.release).toHaveBeenCalled();
  });

  it("still answers denied, not locked, for a secret key, so a lock never reveals a hidden key", async () => {
    const d = deps(["0_webhook_url_form"]);
    const { results } = await saveCustomValues({ tenantId: "T1", actorId: "U1", changes: [{ key: "0_webhook_url_form", expected: "", value: "https://example.test" }] }, d);
    expect(results[0].status).toBe("denied");
  });

  it("names a locked field in the save summary and says who to ask", () => {
    expect(saveProblem([{ key: "business_name", status: "locked" }])).toBe("Business name is locked by Forge Forward. Ask us to change it.");
  });
});

describe("admin save (scope admin)", () => {
  const admin = (d: SaveDeps, changes: { key: string; expected: string; value: string; clear?: true }[]) =>
    saveCustomValues({ tenantId: "T1", actorId: "A1", changes, scope: "admin" }, d);

  it("ignores locks and does not read them", async () => {
    const d = deps(["business_name"]);
    const { results } = await admin(d, [{ key: "business_name", expected: "Test Co", value: "New Co" }]);
    expect(results).toEqual([{ key: "business_name", status: "saved" }]);
    expect(d.locks).not.toHaveBeenCalled();
  });

  it("writes a secret-looking key and a secret-looking value, with the admin as the actor", async () => {
    const d = deps();
    const { results } = await admin(d, [
      { key: "0_webhook_url_form", expected: "https://hooks.example.test/old", value: "https://hooks.example.test/new" },
      { key: "business_main_x", expected: "sk_live_madeupold123456", value: "sk_live_madeupnew123456" },
    ]);
    expect(results.map((r) => r.status)).toEqual(["saved", "saved"]);
    expect(d.store.get("0_webhook_url_form")?.value).toBe("https://hooks.example.test/new");
    expect(d.begin.mock.calls.every(([row]) => row.actorId === "A1")).toBe(true);
  });

  it("keeps secret-looking values out of the audit table", async () => {
    const d = deps();
    await admin(d, [{ key: "stripe_secret", expected: "madeup-old", value: "madeup-new" }]);
    const row = d.begin.mock.calls[0][0];
    expect(row.key).toBe("stripe_secret");
    expect(JSON.stringify(row)).not.toContain("madeup");
  });

  it("keeps the audit value of a shown key, so the change can be undone", async () => {
    const d = deps();
    await admin(d, [{ key: "business_name", expected: "Test Co", value: "New Co" }]);
    expect(d.begin.mock.calls[0][0]).toMatchObject({ previousValue: "Test Co", newValue: "New Co" });
  });

  it("still refuses a stale value, a value too long to send and a key that does not exist", async () => {
    const d = deps();
    const { results } = await admin(d, [
      { key: "stripe_secret", expected: "other", value: "madeup-new" },
      { key: "seasonal_offer_text", expected: "", value: "short" },
      { key: "not_there", expected: "", value: "x" },
    ]);
    expect(results.map((r) => r.status)).toEqual(["conflict", "denied", "missing"]);
    expect(d.update).not.toHaveBeenCalled();
  });

  it("an owner save without scope still refuses a secret-looking key", async () => {
    const d = deps();
    const { results } = await saveCustomValues({ tenantId: "T1", actorId: "U1", changes: [{ key: "stripe_secret", expected: "madeup-old", value: "madeup-new" }] }, d);
    expect(results[0].status).toBe("denied");
  });
});
