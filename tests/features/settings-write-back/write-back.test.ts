import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleSaveValues, isWriteBackEnabled, saveCustomValues, type SaveDeps } from "@/features/settings-write-back";

// Mocked HighLevel and database only. All values are fake.
const detail = (key: string, value: string) => ({ id: `id-${key}`, key, name: `Name ${key}`, value });
const VALUES = [detail("business_phone_number", "111"), detail("main_color", "#111111"), detail("text_on_main_color", "#FFFFFF"), detail("business_website_url", "https://a.test"), detail("0_webhook_url_form", "https://hook.test")];

function deps(over: Partial<SaveDeps> = {}) {
  return {
    read: vi.fn(async () => ({ ok: true as const, values: VALUES })),
    update: vi.fn(async () => "saved" as const),
    begin: vi.fn(async () => "audit-1"),
    finish: vi.fn(async () => {}),
    invalidate: vi.fn(),
    ...over,
  } satisfies SaveDeps;
}
const save = (d: SaveDeps, changes: { key: string; expected: string; value: string }[]) =>
  saveCustomValues({ tenantId: "T1", actorId: "U1", changes }, d);
const phone = (value: string, expected = "111") => ({ key: "business_phone_number", expected, value });

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("saveCustomValues", () => {
  it("writes a changed value, audits it first and clears the brand cache", async () => {
    const d = deps();
    expect(await save(d, [phone("222")])).toEqual({ results: [{ key: "business_phone_number", status: "saved" }] });
    expect(d.begin).toHaveBeenCalledWith({ tenantId: "T1", actorId: "U1", key: "business_phone_number", previousValue: "111", newValue: "222" });
    expect(vi.mocked(d.begin).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(d.update).mock.invocationCallOrder[0]);
    expect(d.update).toHaveBeenCalledWith("T1", VALUES[0], "222");
    expect(d.finish).toHaveBeenCalledWith("audit-1", "saved");
    expect(d.invalidate).toHaveBeenCalledWith("T1");
  });

  it("does not overwrite a value that changed in HighLevel", async () => {
    const d = deps();
    expect((await save(d, [phone("222", "000")])).results[0]).toEqual({ key: "business_phone_number", status: "conflict", current: "111" });
    expect(d.update).not.toHaveBeenCalled();
    expect(d.begin).not.toHaveBeenCalled();
  });

  it("skips the write on a repeat, when HighLevel already holds the value", async () => {
    const d = deps();
    expect((await save(d, [phone("111", "000")])).results[0].status).toBe("unchanged");
    expect(d.update).not.toHaveBeenCalled();
    expect(d.invalidate).not.toHaveBeenCalled();
  });

  it("refuses a key off the allowlist, even one that exists", async () => {
    const d = deps();
    expect((await save(d, [{ key: "0_webhook_url_form", expected: "https://hook.test", value: "https://evil.test" }])).results[0].status).toBe("denied");
    expect(d.update).not.toHaveBeenCalled();
  });

  it("never creates a value the sub-account does not have", async () => {
    const d = deps();
    expect((await save(d, [{ key: "business_email", expected: "", value: "a@b.test" }])).results[0].status).toBe("missing");
    expect(d.update).not.toHaveBeenCalled();
  });

  it("refuses to blank a value", async () => {
    const d = deps();
    expect((await save(d, [phone("   ")])).results[0].status).toBe("invalid");
    expect(d.update).not.toHaveBeenCalled();
  });

  it("applies the form's validation", async () => {
    const d = deps();
    const bad = await save(d, [{ key: "main_color", expected: "#111111", value: "red" }, { key: "business_website_url", expected: "https://a.test", value: "http://a.test" }]);
    expect(bad.results.map((r) => r.status)).toEqual(["invalid", "invalid"]);
    expect(d.update).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "http://a.test", "not a link"])("refuses %s as a link", async (value) => {
    const d = deps();
    expect((await save(d, [{ key: "business_website_url", expected: "https://a.test", value }])).results[0].status).toBe("invalid");
    expect(d.update).not.toHaveBeenCalled();
  });

  it.each(["<script>x</script>", "a\u0000b", "line\nbreak"])("refuses markup or control characters in %j", async (value) => {
    const d = deps();
    expect((await save(d, [phone(value)])).results[0].status).toBe("invalid");
    expect(d.update).not.toHaveBeenCalled();
  });

  it("refuses a color pair that fails the contrast rule, and still saves the rest", async () => {
    const d = deps();
    const out = await save(d, [{ key: "text_on_main_color", expected: "#FFFFFF", value: "#111111" }, phone("222")]);
    expect(out.results.find((r) => r.key === "text_on_main_color")?.status).toBe("invalid");
    expect(out.results.find((r) => r.key === "business_phone_number")?.status).toBe("saved");
    expect(d.update).toHaveBeenCalledTimes(1);
  });

  it("reports each key on a partial failure", async () => {
    const update = vi.fn(async (_t: string, target: { key: string }) => (target.key === "main_color" ? ("retry" as const) : ("saved" as const)));
    const d = deps({ update });
    const out = await save(d, [phone("222"), { key: "main_color", expected: "#111111", value: "#222222" }]);
    expect(out.results.map((r) => r.status)).toEqual(["saved", "retry"]);
    expect(d.finish).toHaveBeenCalledWith("audit-1", "retry");
    expect(d.invalidate).toHaveBeenCalledWith("T1");
  });

  it("makes no write when the audit row cannot be stored", async () => {
    const d = deps({ begin: vi.fn(async () => { throw new Error("db"); }) });
    expect((await save(d, [phone("222")])).results[0].status).toBe("retry");
    expect(d.update).not.toHaveBeenCalled();
  });

  it("still reports a saved value when closing its audit row fails", async () => {
    const d = deps({ finish: vi.fn(async () => { throw new Error("db"); }) });
    expect((await save(d, [phone("222")])).results[0].status).toBe("saved");
  });

  it("writes nothing when the fresh read fails", async () => {
    const d = deps({ read: vi.fn(async () => ({ ok: false as const, reason: "permission" as const })) });
    expect((await save(d, [phone("222")])).results[0].status).toBe("permission");
    expect(d.update).not.toHaveBeenCalled();
  });

  it("runs at most three writes at once", async () => {
    let running = 0;
    let most = 0;
    const update = vi.fn(async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return "saved" as const;
    });
    const many = Array.from({ length: 7 }, (_, i) => `business_hours_${["weekdays_open", "weekdays_close", "saturday_open", "saturday_close", "sunday_open", "sunday_close"][i % 6]}`);
    const keys = [...new Set(many)];
    const values = keys.map((key) => detail(key, "old"));
    const d = deps({ read: vi.fn(async () => ({ ok: true as const, values })), update });
    await save(d, keys.map((key) => ({ key, expected: "old", value: "new" })));
    expect(update).toHaveBeenCalledTimes(keys.length);
    expect(most).toBeLessThanOrEqual(3);
  });
});

describe("isWriteBackEnabled", () => {
  it("needs both flags and the exact tenant", () => {
    expect(isWriteBackEnabled("T1", {})).toBe(false);
    expect(isWriteBackEnabled("T1", { SETTINGS_WRITE_BACK_ENABLED: "true" })).toBe(false);
    expect(isWriteBackEnabled("T1", { SETTINGS_WRITE_BACK_TENANTS: "T1" })).toBe(false);
    expect(isWriteBackEnabled("T1", { SETTINGS_WRITE_BACK_ENABLED: "1", SETTINGS_WRITE_BACK_TENANTS: "T1" })).toBe(false);
    expect(isWriteBackEnabled("T1", { SETTINGS_WRITE_BACK_ENABLED: "true", SETTINGS_WRITE_BACK_TENANTS: "T2, T11" })).toBe(false);
    expect(isWriteBackEnabled("T1", { SETTINGS_WRITE_BACK_ENABLED: "true", SETTINGS_WRITE_BACK_TENANTS: "T2, T1" })).toBe(true);
    expect(isWriteBackEnabled("*", { SETTINGS_WRITE_BACK_ENABLED: "true", SETTINGS_WRITE_BACK_TENANTS: "" })).toBe(false);
  });
});

describe("POST /api/settings/values", () => {
  const ORIGIN = "https://app.test";
  const owner = { id: "U1", role: "owner" as const, tenantId: "T1" };
  const body = { changes: [phone("222")] };
  const request = (payload: unknown = body, origin: string | null = ORIGIN) =>
    new Request(`${ORIGIN}/api/settings/values`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
  const routeDeps = (over: Partial<Parameters<typeof handleSaveValues>[1]> = {}) => ({
    appOrigin: ORIGIN,
    currentUser: vi.fn(async () => owner as { id: string; role: "owner" | "office" | "admin"; tenantId: string | null } | null),
    isEnabled: vi.fn(() => true),
    hit: vi.fn(async () => true),
    save: vi.fn(async () => ({ results: [{ key: "business_phone_number", status: "saved" as const }] })),
    ...over,
  });

  it("saves for the session's tenant and user", async () => {
    const d = routeDeps();
    const out = await handleSaveValues(request(), d);
    expect(out.status).toBe(200);
    expect(d.save).toHaveBeenCalledWith({ tenantId: "T1", actorId: "U1", changes: body.changes });
    expect(out.headers.get("cache-control")).toBe("no-store");
  });

  it("ignores a tenant named in the body by refusing the body", async () => {
    const d = routeDeps();
    expect((await handleSaveValues(request({ ...body, tenantId: "T2" }), d)).status).toBe(400);
    expect(d.save).not.toHaveBeenCalled();
  });

  it.each([["another origin", "https://evil.test"], ["no origin", null]])("refuses %s", async (_name, origin) => {
    const d = routeDeps();
    expect((await handleSaveValues(request(body, origin), d)).status).toBe(403);
    expect(d.currentUser).not.toHaveBeenCalled();
  });

  it("refuses a signed-out request", async () => {
    expect((await handleSaveValues(request(), routeDeps({ currentUser: vi.fn(async () => null) }))).status).toBe(401);
  });

  it.each([
    ["an office user", { id: "U2", role: "office" as const, tenantId: "T1" }],
    ["an admin, also in a client view", { id: "A1", role: "admin" as const, tenantId: null }],
    ["an admin carrying a viewed tenant", { id: "A1", role: "admin" as const, tenantId: "T1" }],
  ])("refuses %s", async (_name, user) => {
    const d = routeDeps({ currentUser: vi.fn(async () => user) });
    expect((await handleSaveValues(request(), d)).status).toBe(403);
    expect(d.save).not.toHaveBeenCalled();
  });

  it("answers 404 and calls nothing further with the flag off", async () => {
    const d = routeDeps({ isEnabled: vi.fn(() => false) });
    expect((await handleSaveValues(request(), d)).status).toBe(404);
    expect(d.hit).not.toHaveBeenCalled();
    expect(d.save).not.toHaveBeenCalled();
  });

  it("limits per user and per tenant, and fails closed", async () => {
    const counted = routeDeps();
    await handleSaveValues(request(), counted);
    expect(vi.mocked(counted.hit).mock.calls.map((c) => [c[0], c[1]])).toEqual([["settings-save-user:U1", 10], ["settings-save-tenant:T1", 30]]);
    const over = routeDeps({ hit: vi.fn(async () => false) });
    expect((await handleSaveValues(request(), over)).status).toBe(429);
    const broken = routeDeps({ hit: vi.fn(async () => { throw new Error("db"); }) });
    expect((await handleSaveValues(request(), broken)).status).toBe(429);
    expect(over.save).not.toHaveBeenCalled();
    expect(broken.save).not.toHaveBeenCalled();
  });

  it.each([
    ["bad JSON", "{"],
    ["no changes", { changes: [] }],
    ["too many", { changes: Array.from({ length: 21 }, (_, i) => phone(String(i))).map((c, i) => ({ ...c, key: `k${i}` })) }],
    ["a repeated key", { changes: [phone("2"), phone("3")] }],
    ["a non-string value", { changes: [{ key: "a", expected: "b", value: 1 }] }],
    ["an extra field", { changes: [{ ...phone("2"), id: "x" }] }],
    ["a long value", { changes: [phone("x".repeat(2001))] }],
    ["an oversized body", JSON.stringify({ changes: [phone("x".repeat(70_000))] })],
  ])("refuses %s", async (_name, payload) => {
    const d = routeDeps();
    expect((await handleSaveValues(request(payload), d)).status).toBe(400);
    expect(d.save).not.toHaveBeenCalled();
  });
});
