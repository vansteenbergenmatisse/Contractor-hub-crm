import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleAdminValues, type AdminValuesRouteDeps } from "@/features/admin-values";

// Wave E: POST /api/admin/clients/[tenantId]/values. Admin only, same Origin, refused during View as
// client, rate limited, connected tenant from the URL, write-back flag for saves. Made-up values.
const ORIGIN = "https://crm.example.test";

function deps(over: Partial<AdminValuesRouteDeps> = {}) {
  return {
    appOrigin: ORIGIN,
    adminId: vi.fn(async () => "A1"),
    isViewing: vi.fn(async () => false),
    limiter: vi.fn(async () => true),
    isConnected: vi.fn(async () => true),
    isEnabled: vi.fn(() => true),
    save: vi.fn<AdminValuesRouteDeps["save"]>(async (input) => ({ results: input.changes.map(({ key }) => ({ key, status: "saved" as const })) })),
    lock: vi.fn<AdminValuesRouteDeps["lock"]>(async () => {}),
    unlock: vi.fn<AdminValuesRouteDeps["unlock"]>(async () => {}),
    ...over,
  } satisfies AdminValuesRouteDeps;
}

const post = (body: unknown, headers: Record<string, string> = { origin: ORIGIN, "content-type": "application/json" }) =>
  new Request(`${ORIGIN}/api/admin/clients/T1/values`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
const SAVE = { action: "save", key: "0_webhook_url_form", expected: "https://hooks.example.test/old", value: "https://hooks.example.test/new" };

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); });

describe("who may call it", () => {
  it("saves for an admin, as the admin, with scope admin, to the tenant in the URL", async () => {
    const d = deps();
    const response = await handleAdminValues(post(SAVE), "T1", d);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ results: [{ key: "0_webhook_url_form", status: "saved" }] });
    expect(d.save).toHaveBeenCalledWith({ tenantId: "T1", actorId: "A1", scope: "admin", changes: [{ key: SAVE.key, expected: SAVE.expected, value: SAVE.value }] });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each([[undefined], ["https://evil.test"]])("refuses origin %s", async (origin) => {
    const d = deps();
    const response = await handleAdminValues(post(SAVE, origin ? { origin, "content-type": "application/json" } : { "content-type": "application/json" }), "T1", d);
    expect(response.status).toBe(403);
    expect(d.adminId).not.toHaveBeenCalled();
  });

  it("refuses a non-admin", async () => {
    const d = deps({ adminId: vi.fn(async () => null) });
    expect((await handleAdminValues(post(SAVE), "T1", d)).status).toBe(403);
    expect(d.save).not.toHaveBeenCalled();
  });

  it("refuses during View as client, also when the check fails", async () => {
    expect((await handleAdminValues(post(SAVE), "T1", deps({ isViewing: vi.fn(async () => true) }))).status).toBe(403);
    const broken = deps({ isViewing: vi.fn(async () => { throw new Error("x"); }) });
    expect((await handleAdminValues(post(SAVE), "T1", broken)).status).toBe(403);
    expect(broken.save).not.toHaveBeenCalled();
  });

  it("is rate limited per admin", async () => {
    const d = deps({ limiter: vi.fn(async () => false) });
    expect((await handleAdminValues(post(SAVE), "T1", d)).status).toBe(429);
    expect(d.limiter).toHaveBeenCalledWith("admin-values:A1");
    expect(d.save).not.toHaveBeenCalled();
  });

  it("answers 404 for a tenant that is not connected, and 400 for a malformed id", async () => {
    const d = deps({ isConnected: vi.fn(async () => false) });
    expect((await handleAdminValues(post(SAVE), "T1", d)).status).toBe(404);
    expect((await handleAdminValues(post(SAVE), "../x", deps())).status).toBe(400);
    expect(d.save).not.toHaveBeenCalled();
  });
});

describe("the write-back flag", () => {
  it("refuses a save when write-back is off or the tenant is excluded, and writes nothing", async () => {
    const d = deps({ isEnabled: vi.fn(() => false) });
    const response = await handleAdminValues(post(SAVE), "T1", d);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "write_off" });
    expect(d.save).not.toHaveBeenCalled();
  });

  it("still locks and unlocks (app data only, nothing is written to HighLevel)", async () => {
    const d = deps({ isEnabled: vi.fn(() => false) });
    expect(await (await handleAdminValues(post({ action: "lock", key: "business_name" }), "T1", d)).json()).toEqual({ key: "business_name", locked: true });
    expect(d.lock).toHaveBeenCalledWith("T1", "business_name", "A1");
    expect(await (await handleAdminValues(post({ action: "unlock", key: "business_name" }), "T1", d)).json()).toEqual({ key: "business_name", locked: false });
    expect(d.unlock).toHaveBeenCalledWith("T1", "business_name");
    expect(d.save).not.toHaveBeenCalled();
  });
});

describe("the body", () => {
  it("sends an empty value as an explicit clear", async () => {
    const d = deps();
    await handleAdminValues(post({ action: "save", key: "seasonal_offer_text", expected: "Old", value: "" }), "T1", d);
    expect(vi.mocked(d.save).mock.calls[0][0].changes).toEqual([{ key: "seasonal_offer_text", expected: "Old", value: "", clear: true }]);
  });

  it.each([
    ["not JSON", "{"],
    ["an unknown action", { action: "delete", key: "business_name" }],
    ["an extra field", { ...SAVE, tenantId: "T2" }],
    ["a bad key", { action: "lock", key: "a b" }],
    ["a value too long", { ...SAVE, value: "x".repeat(2001) }],
    ["a missing expected", { action: "save", key: "business_name", value: "x" }],
  ])("refuses %s", async (_name, body) => {
    const d = deps();
    expect((await handleAdminValues(post(body), "T1", d)).status).toBe(400);
    expect(d.save).not.toHaveBeenCalled();
    expect(d.lock).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON by content type", async () => {
    expect((await handleAdminValues(post(SAVE, { origin: ORIGIN, "content-type": "text/plain" }), "T1", deps())).status).toBe(415);
  });

  it("logs key names only, never values", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await handleAdminValues(post(SAVE), "T1", deps());
    const logged = info.mock.calls.flat().join(" ");
    expect(logged).toContain("0_webhook_url_form");
    expect(logged).not.toContain("hooks.example.test");
  });
});
