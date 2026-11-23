import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomValueWriteOutcome } from "@/features/highlevel";
import { handleSaveValues, isWriteBackEnabled, saveCustomValues, type SaveDeps } from "@/features/settings-write-back";

// Mocked HighLevel and database only. All values are fake.
const detail = (key: string, value: string) => ({ id: `id-${key}`, key, name: `Name ${key}`, value });
const VALUES = [
  detail("business_phone_number", "111"), detail("business_email", "a@b.test"), detail("main_color", "#111111"), detail("text_on_main_color", "#FFFFFF"),
  detail("business_website_url", "https://a.test"), detail("seasonal_offer_text", "Old offer"), detail("business_latitude", "48.5"),
  detail("business_hours_weekdays_open", "08:00"), detail("business_hours_weekdays_close", "17:00"), detail("business_hours_saturday_open", "09:00"),
  detail("business_hours_saturday_close", "12:00"), detail("0_webhook_url_form", "https://hook.test"),
];

// A small fake HighLevel: `fail` answers without applying, `applyThenFail` applies and gives no answer.
function deps(options: { fail?: Record<string, CustomValueWriteOutcome>; applyThenFail?: string[] } = {}) {
  const { fail = {}, applyThenFail = [] } = options;
  const store = new Map(VALUES.map((row) => [row.key, { ...row }]));
  let audits = 0;
  return {
    store,
    read: vi.fn<SaveDeps["read"]>(async () => ({ ok: true, values: [...store.values()].map((row) => ({ ...row })) })),
    update: vi.fn<SaveDeps["update"]>(async (...args) => {
      const [, target, value] = args;
      if (fail[target.key]) return fail[target.key];
      (store.get(target.key) as { value: string }).value = value;
      return applyThenFail.includes(target.key) ? "no_answer" : "saved";
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
const change = (key: string, value: string) => ({ key, expected: VALUES.find((row) => row.key === key)?.value ?? "", value });
const phone = (value: string, expected = "111") => ({ key: "business_phone_number", expected, value });
const status = async (d: SaveDeps, key: string, value: string) => (await save(d, [change(key, value)])).results[0].status;

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}); });

describe("saveCustomValues", () => {
  it("writes a changed value, audits it first, confirms it and clears the brand cache", async () => {
    const d = deps();
    expect(await save(d, [phone("222")])).toEqual({ results: [{ key: "business_phone_number", status: "saved" }] });
    expect(d.begin).toHaveBeenCalledWith({ tenantId: "T1", actorId: "U1", key: "business_phone_number", previousValue: "111", newValue: "222" });
    expect(d.begin.mock.invocationCallOrder[0]).toBeLessThan(d.update.mock.invocationCallOrder[0]);
    expect(d.finish).toHaveBeenCalledWith("audit-1", "saved");
    expect(d.invalidate).toHaveBeenCalledWith("T1");
    expect(d.release).toHaveBeenCalledWith("T1", "holder");
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
    expect(await status(d, "0_webhook_url_form", "https://evil.test")).toBe("denied");
    expect(d.update).not.toHaveBeenCalled();
  });

  it("never creates a value the sub-account does not have", async () => {
    const d = deps();
    expect((await save(d, [{ key: "business_address_city", expected: "", value: "Town" }])).results[0].status).toBe("missing");
    expect(d.update).not.toHaveBeenCalled();
  });

  it.each([
    ["a blank", "business_phone_number", "   "],
    ["a bad color", "main_color", "red"],
    ["plain http", "business_website_url", "http://a.test"],
    ["a script link", "business_website_url", "javascript:alert(1)"],
    ["a quote in a link", "business_website_url", 'https://a.test/"onmouseover="alert(1)'],
    ["a single quote in a link", "business_website_url", "https://a.test/'x"],
    ["link credentials", "business_website_url", "https://user:pw@a.test/"],
    ["markup", "seasonal_offer_text", "<script>x</script>"],
    ["a double quote", "seasonal_offer_text", 'Say "hi"'],
    ["a backtick", "seasonal_offer_text", "a`b"],
    ["a backslash", "seasonal_offer_text", "a\\b"],
    ["a control character", "seasonal_offer_text", "a\u0000b"],
    ["a line break", "seasonal_offer_text", "line\nbreak"],
    ["a bidi character", "seasonal_offer_text", "a\u202Eb"],
    ["a zero-width character", "seasonal_offer_text", "a\u200Bb"],
    ["a merge tag for a secret", "seasonal_offer_text", "{{custom_values.0_webhook_url_form}}"],
    ["a contact merge tag", "seasonal_offer_text", "{{contact.email}}"],
    ["a template tag", "seasonal_offer_text", "{% if x %}"],
    ["a bad email", "business_email", "not-an-email"],
    ["letters in a phone", "business_phone_number", "call me"],
    ["a latitude off the globe", "business_latitude", "120"],
    ["text in hours", "business_hours_weekdays_open", "whenever"],
    ["12-hour time the app cannot read", "business_hours_weekdays_open", "5pm"],
    ["a bare hour", "business_hours_weekdays_open", "25"],
    ["an impossible time", "business_hours_weekdays_open", "99:99"],
  ])("refuses %s", async (_name, key, value) => {
    const d = deps();
    expect(await status(d, key, value)).toBe("invalid");
    expect(d.update).not.toHaveBeenCalled();
  });

  it.each([
    ["business_phone_number", "+1 (360)-226-8362"],
    ["business_email", "office@example.test"],
    ["business_latitude", "-48.49122"],
    ["business_hours_weekdays_open", "00:00"],
    ["business_hours_weekdays_open", "17:30"],
    ["business_hours_weekdays_open", "Closed"],
    ["seasonal_offer_text", "Fall leaf cleanup, $25 off. Don't wait!"],
    ["business_website_url", "https://a.test/page?x=1"],
  ])("accepts %s = %s", async (key, value) => {
    expect(await status(deps(), key, value)).toBe("saved");
  });

  it("refuses a color pair that fails the contrast rule, and still saves the rest", async () => {
    const d = deps();
    const out = await save(d, [change("text_on_main_color", "#111111"), phone("222")]);
    expect(out.results.find((r) => r.key === "text_on_main_color")?.status).toBe("invalid");
    expect(out.results.find((r) => r.key === "business_phone_number")?.status).toBe("saved");
    expect(d.update).toHaveBeenCalledTimes(1);
  });

  it("reports each key on a partial failure", async () => {
    const d = deps({ fail: { business_email: "retry" } });
    const out = await save(d, [phone("222"), change("business_email", "c@d.test")]);
    expect(out.results.map((r) => r.status)).toEqual(["saved", "retry"]);
    expect(d.finish).toHaveBeenCalledWith("audit-2", "failed");
    expect(d.invalidate).toHaveBeenCalledWith("T1");
  });

  it("audits a write that applied although HighLevel answered an error as saved", async () => {
    const d = deps({ applyThenFail: ["business_phone_number"] });
    expect((await save(d, [phone("222")])).results[0].status).toBe("saved");
    expect(d.finish).toHaveBeenCalledWith("audit-1", "saved");
  });

  it("calls a write with no answer and the old value unknown, and keeps the lease until it expires", async () => {
    const d = deps({ fail: { business_phone_number: "no_answer" } });
    expect((await save(d, [phone("222")])).results[0].status).toBe("unknown");
    expect(d.finish).toHaveBeenCalledWith("audit-1", "unknown");
    expect(d.release).not.toHaveBeenCalled();
  });

  it("does not claim saved when a 2xx did not change the value", async () => {
    const d = deps();
    d.update.mockResolvedValue("saved");
    expect((await save(d, [phone("222")])).results[0].status).toBe("unknown");
    expect(d.finish).toHaveBeenCalledWith("audit-1", "unknown");
  });

  it("reports unknown when the confirming read fails", async () => {
    const d = deps();
    const first = await d.read("T1");
    d.read.mockResolvedValueOnce(first).mockResolvedValueOnce({ ok: false, reason: "retry" });
    expect((await save(d, [phone("222")])).results[0].status).toBe("unknown");
    expect(d.finish).toHaveBeenCalledWith("audit-1", "unknown");
  });

  it("makes no write when the audit row cannot be stored", async () => {
    const d = deps();
    d.begin.mockRejectedValue(new Error("db"));
    expect((await save(d, [phone("222")])).results[0].status).toBe("retry");
    expect(d.update).not.toHaveBeenCalled();
  });

  it("still reports a saved value when closing its audit row fails", async () => {
    const d = deps();
    d.finish.mockRejectedValue(new Error("db"));
    expect((await save(d, [phone("222")])).results[0].status).toBe("saved");
  });

  it("writes nothing when the fresh read fails, and releases the lease", async () => {
    const d = deps();
    d.read.mockResolvedValue({ ok: false, reason: "permission" });
    expect((await save(d, [phone("222")])).results[0].status).toBe("permission");
    expect(d.update).not.toHaveBeenCalled();
    expect(d.release).toHaveBeenCalled();
  });

  it("writes nothing while another save holds the tenant", async () => {
    const d = deps();
    d.claim.mockResolvedValue(null);
    expect((await save(d, [phone("222")])).results[0].status).toBe("busy");
    expect(d.read).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
    expect(d.release).not.toHaveBeenCalled();
  });

  it("writes nothing when the lease cannot be claimed", async () => {
    const d = deps();
    d.claim.mockRejectedValue(new Error("db"));
    expect((await save(d, [phone("222")])).results[0].status).toBe("retry");
    expect(d.update).not.toHaveBeenCalled();
  });

  const hours = ["business_hours_weekdays_open", "business_hours_weekdays_close", "business_hours_saturday_open", "business_hours_saturday_close"];

  it("runs at most three writes at once", async () => {
    const d = deps();
    let running = 0;
    let most = 0;
    const real = d.update.getMockImplementation() as SaveDeps["update"];
    d.update.mockImplementation(async (...args) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return real(...args);
    });
    const out = await save(d, hours.map((key) => change(key, "10:00")));
    expect(out.results.every((r) => r.status === "saved")).toBe(true);
    expect(most).toBeLessThanOrEqual(3);
  });

  it("re-checks HighLevel before a later batch and does not overwrite a newer edit", async () => {
    const d = deps();
    const real = d.update.getMockImplementation() as SaveDeps["update"];
    d.update.mockImplementation(async (...args) => {
      const result = await real(...args);
      (d.store.get("business_hours_saturday_close") as { value: string }).value = "13:00";
      return result;
    });
    const out = await save(d, hours.map((key) => change(key, "10:00")));
    expect(out.results[3]).toEqual({ key: "business_hours_saturday_close", status: "conflict", current: "13:00" });
    expect(d.store.get("business_hours_saturday_close")?.value).toBe("13:00");
  });

  it("stops starting batches when the time budget is used", async () => {
    const d = deps();
    d.now.mockReturnValueOnce(0).mockReturnValue(60_000);
    const out = await save(d, hours.map((key) => change(key, "10:00")));
    expect(out.results.map((r) => r.status)).toEqual(["saved", "saved", "saved", "retry"]);
    expect(d.update).toHaveBeenCalledTimes(3);
  });

  describe("the main color and its text color", () => {
    const pair = [change("main_color", "#222222"), change("text_on_main_color", "#EEEEEE")];

    it("saves both", async () => {
      const d = deps();
      expect((await save(d, pair)).results.map((r) => r.status)).toEqual(["saved", "saved"]);
    });

    it("does not write the second when the first fails", async () => {
      const d = deps({ fail: { main_color: "rejected" } });
      expect((await save(d, pair)).results.map((r) => r.status)).toEqual(["rejected", "retry"]);
      expect(d.store.get("text_on_main_color")?.value).toBe("#FFFFFF");
    });

    it("restores the first, with an audit row, when the second fails", async () => {
      const d = deps({ fail: { text_on_main_color: "rejected" } });
      expect((await save(d, pair)).results.map((r) => r.status)).toEqual(["retry", "rejected"]);
      expect(d.store.get("main_color")?.value).toBe("#111111");
      expect(d.begin).toHaveBeenCalledWith(expect.objectContaining({ key: "main_color", previousValue: "#222222", newValue: "#111111" }));
      expect(d.finish).toHaveBeenCalledWith("audit-1", "reverted");
      expect(d.finish).toHaveBeenCalledWith("audit-3", "saved");
    });

    it("reports the pair as unconfirmed when the first has no answer but applied", async () => {
      const d = deps({ applyThenFail: ["main_color"] });
      expect((await save(d, pair)).results.map((r) => r.status)).toEqual(["unknown", "retry"]);
      expect(d.update).toHaveBeenCalledTimes(1);
    });

    it("does not restore while the second has no answer", async () => {
      const d = deps({ fail: { text_on_main_color: "no_answer" } });
      expect((await save(d, pair)).results.map((r) => r.status)).toEqual(["unknown", "unknown"]);
      expect(d.update).toHaveBeenCalledTimes(2);
      expect(d.store.get("main_color")?.value).toBe("#222222");
      expect(d.release).not.toHaveBeenCalled();
    });

    it("does not restore over a newer edit made in HighLevel", async () => {
      const d = deps({ fail: { text_on_main_color: "rejected" } });
      const real = d.update.getMockImplementation() as SaveDeps["update"];
      d.update.mockImplementation(async (...args) => {
        const answer = await real(...args);
        if (args[1].key === "text_on_main_color") (d.store.get("main_color") as { value: string }).value = "#333333";
        return answer;
      });
      expect((await save(d, pair)).results[0].status).toBe("unknown");
      expect(d.update).toHaveBeenCalledTimes(2);
      expect(d.store.get("main_color")?.value).toBe("#333333");
    });

    it("skips the restore when too little time is left, and says it is unconfirmed", async () => {
      const d = deps({ fail: { text_on_main_color: "rejected" } });
      d.now.mockReturnValueOnce(0).mockReturnValue(60_000);
      expect((await save(d, pair)).results[0].status).toBe("unknown");
      expect(d.update).toHaveBeenCalledTimes(2);
    });

    it("settles the restore's audit row from the final read", async () => {
      const d = deps({ fail: { text_on_main_color: "rejected" } });
      const real = d.update.getMockImplementation() as SaveDeps["update"];
      d.update.mockImplementation(async (...args) => (args[2] === "#111111" ? "saved" : real(...args)));
      expect((await save(d, pair)).results[0].status).toBe("unknown");
      expect(d.finish).toHaveBeenCalledWith("audit-3", "unknown");
      expect(d.finish).toHaveBeenCalledWith("audit-1", "unknown");
    });

    it("keeps both when the second applied despite an error answer", async () => {
      const d = deps({ applyThenFail: ["text_on_main_color"] });
      expect((await save(d, pair)).results.map((r) => r.status)).toEqual(["saved", "saved"]);
      expect(d.store.get("main_color")?.value).toBe("#222222");
    });
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
