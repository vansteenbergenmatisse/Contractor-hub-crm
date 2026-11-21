import { afterEach, describe, expect, it, vi } from "vitest";
import { createGuards, handleSetTenantLogin, type SessionUser } from "@/features/auth";

const ORIGIN = "https://crm.example.test";
const admin: SessionUser = { id: "a1", email: "a@x.test", name: "A", role: "admin", tenantId: null };
const owner: SessionUser = { id: "u1", email: "o@x.test", name: "O", role: "owner", tenantId: "T1" };
const office: SessionUser = { ...owner, id: "u2", role: "office" };

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/admin/clients/T1/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

function setup(user: SessionUser | null, userIds: string[] | null = ["u1", "u2"]) {
  const setUserDisabled = vi.fn(async () => {});
  const listUserIds = vi.fn(async () => userIds);
  const limiter = vi.fn(async () => true);
  const deps = {
    guards: createGuards({ getSession: async () => user }),
    listUserIds,
    setUserDisabled,
    limiter,
    appOrigin: ORIGIN,
  };
  return { deps, setUserDisabled, listUserIds, limiter };
}

afterEach(() => vi.restoreAllMocks());

describe("handleSetTenantLogin", () => {
  it("turns off every user of the tenant and reports how many", async () => {
    const { deps, setUserDisabled } = setup(admin);
    const response = await handleSetTenantLogin(post({ disabled: true }), "T1", deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ affected: 2 });
    expect(setUserDisabled.mock.calls).toEqual([["u1", true], ["u2", true]]);
  });

  it("turns login back on", async () => {
    const { deps, setUserDisabled } = setup(admin, ["u1"]);
    await handleSetTenantLogin(post({ disabled: false }), "T1", deps);
    expect(setUserDisabled).toHaveBeenCalledWith("u1", false);
  });

  it.each([
    ["owner", owner],
    ["office", office],
    ["signed out", null],
  ])("refuses %s with 403 and touches nothing", async (_name, user) => {
    const { deps, setUserDisabled, listUserIds } = setup(user);
    const response = await handleSetTenantLogin(post({ disabled: true }), "T1", deps);
    expect(response.status).toBe(403);
    expect(setUserDisabled).not.toHaveBeenCalled();
    expect(listUserIds).not.toHaveBeenCalled();
  });

  it("refuses a missing or foreign Origin", async () => {
    for (const headers of [{ origin: "https://evil.test" }, { origin: "" }]) {
      const { deps, setUserDisabled } = setup(admin);
      const response = await handleSetTenantLogin(post({ disabled: true }, headers), "T1", deps);
      expect(response.status).toBe(403);
      expect(setUserDisabled).not.toHaveBeenCalled();
    }
  });

  it("answers 429 when the limiter says no, and when it throws", async () => {
    const denied = setup(admin);
    denied.limiter.mockResolvedValue(false);
    expect((await handleSetTenantLogin(post({ disabled: true }), "T1", denied.deps)).status).toBe(429);
    const broken = setup(admin);
    broken.limiter.mockRejectedValue(new Error("db down"));
    expect((await handleSetTenantLogin(post({ disabled: true }), "T1", broken.deps)).status).toBe(429);
    expect(broken.setUserDisabled).not.toHaveBeenCalled();
  });

  it("rate limits per admin id", async () => {
    const { deps, limiter } = setup(admin);
    await handleSetTenantLogin(post({ disabled: true }), "T1", deps);
    expect(limiter).toHaveBeenCalledWith("tenant-login:a1");
  });

  it("rejects a body that is not JSON, not an object, or has a non-boolean disabled", async () => {
    const { deps, setUserDisabled } = setup(admin);
    expect((await handleSetTenantLogin(post("x", { "content-type": "text/plain" }), "T1", deps)).status).toBe(415);
    for (const body of ["not json", "[]", JSON.stringify({}), JSON.stringify({ disabled: "true" }), JSON.stringify({ disabled: 1 })]) {
      expect((await handleSetTenantLogin(post(body), "T1", deps)).status).toBe(400);
    }
    expect(setUserDisabled).not.toHaveBeenCalled();
  });

  it("rejects an empty or oversized tenant id", async () => {
    const { deps } = setup(admin);
    expect((await handleSetTenantLogin(post({ disabled: true }), "", deps)).status).toBe(400);
    expect((await handleSetTenantLogin(post({ disabled: true }), "x".repeat(65), deps)).status).toBe(400);
  });

  it("answers 404 for an unknown tenant", async () => {
    const { deps, setUserDisabled } = setup(admin, null);
    expect((await handleSetTenantLogin(post({ disabled: true }), "nope", deps)).status).toBe(404);
    expect(setUserDisabled).not.toHaveBeenCalled();
  });

  it("tries every user even if one fails, then answers 500 with a fixed body", async () => {
    const { deps, setUserDisabled } = setup(admin, ["u1", "u2", "u3"]);
    setUserDisabled.mockRejectedValueOnce(new Error("secret detail"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleSetTenantLogin(post({ disabled: true }), "T1", deps);
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("secret detail");
    expect(JSON.parse(text)).toEqual({ error: "partial", affected: 2 });
    expect(setUserDisabled).toHaveBeenCalledTimes(3);
  });

  it("logs an audit line with ids and counts only, never emails", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { deps } = setup(admin);
    await handleSetTenantLogin(post({ disabled: true }), "T1", deps);
    const line = String(info.mock.calls.at(-1)?.[0]);
    expect(JSON.parse(line)).toMatchObject({ audit: "tenant_login_changed", by: "a1", tenantId: "T1", disabled: "true", affected: "2" });
    expect(line).not.toContain("@");
  });

  it("sets no-store on every answer", async () => {
    const { deps } = setup(owner);
    expect((await handleSetTenantLogin(post({ disabled: true }), "T1", deps)).headers.get("cache-control")).toBe("no-store");
  });
});
