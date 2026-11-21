import { describe, expect, it } from "vitest";
import { createGuards, TenancyError, type SessionUser } from "@/features/auth";

// Guards over an injected session lookup: who is signed in, admin check, and the tenancy rule
// (a user of tenant A never reaches tenant B; the tenant comes from the session only).
const owner: SessionUser = { id: "u1", email: "o@example.test", name: "O", role: "owner", tenantId: "A" };
const office: SessionUser = { ...owner, id: "u2", role: "office" };
const admin: SessionUser = { id: "a1", email: "a@example.test", name: "A", role: "admin", tenantId: null };

const request = (cookie = "x=1") => new Request("https://app.example.test/x", { headers: { cookie } });
const guardsFor = (user: SessionUser | null) => createGuards({ getSession: async () => user });

describe("currentUser", () => {
  it("is the session user, or null without a session", async () => {
    expect(await guardsFor(owner).currentUser(request())).toEqual(owner);
    expect(await guardsFor(null).currentUser(request())).toBeNull();
  });

  it("is null when the session lookup throws (fails closed)", async () => {
    const guards = createGuards({ getSession: async () => { throw new Error("db down"); } });
    expect(await guards.currentUser(request())).toBeNull();
  });

  it("is null for a user with an unknown role or a role/tenant mismatch", async () => {
    expect(await guardsFor({ ...owner, role: "root" as never }).currentUser(request())).toBeNull();
    expect(await guardsFor({ ...owner, tenantId: null }).currentUser(request())).toBeNull();
    expect(await guardsFor({ ...admin, tenantId: "A" }).currentUser(request())).toBeNull();
  });

  it("is null for a turned-off user", async () => {
    expect(await guardsFor({ ...owner, disabledAt: new Date() }).currentUser(request())).toBeNull();
  });
});

describe("admin guard", () => {
  it("accepts an admin only", async () => {
    expect(await guardsFor(admin).isAdmin(request())).toBe(true);
    expect(await guardsFor(owner).isAdmin(request())).toBe(false);
    expect(await guardsFor(office).isAdmin(request())).toBe(false);
    expect(await guardsFor(null).isAdmin(request())).toBe(false);
  });

  it("gives the admin id for the OAuth state binding, null for everyone else", async () => {
    expect(await guardsFor(admin).adminId(request())).toBe("a1");
    expect(await guardsFor(owner).adminId(request())).toBeNull();
    expect(await guardsFor(null).adminId(request())).toBeNull();
  });
});

describe("tenancy", () => {
  it("resolves the tenant from the session", async () => {
    expect(await guardsFor(owner).tenantOf(request())).toEqual({ user: owner, tenantId: "A" });
    expect(await guardsFor(office).tenantOf(request())).toEqual({ user: office, tenantId: "A" });
  });

  it("refuses a requested tenant that is not the session tenant, as not found (404)", async () => {
    const error = await guardsFor(owner).tenantOf(request(), "B").catch((e) => e);
    expect(error).toBeInstanceOf(TenancyError);
    expect(error.status).toBe(404);
  });

  it("accepts a requested tenant equal to the session tenant", async () => {
    expect((await guardsFor(owner).tenantOf(request(), "A")).tenantId).toBe("A");
  });

  it("answers 401 without a session and 403 for an admin (staff have no tenant data here)", async () => {
    expect((await guardsFor(null).tenantOf(request()).catch((e) => e)).status).toBe(401);
    expect((await guardsFor(admin).tenantOf(request()).catch((e) => e)).status).toBe(403);
  });

  it("never lets user A reach tenant B whatever the id looks like", async () => {
    for (const requested of ["B", "", " A", "a", "A ", "A\u0000", "*"]) {
      const result = await guardsFor(owner).tenantOf(request(), requested).catch((e) => e);
      expect(result).toBeInstanceOf(TenancyError);
    }
  });
});

describe("more guard cases", () => {
  it("a user of tenant B asking for tenant A is refused too", async () => {
    const userB: SessionUser = { ...owner, id: "u3", tenantId: "B" };
    expect((await guardsFor(userB).tenantOf(request(), "A").catch((e) => e)).status).toBe(404);
  });

  it("a turned-off admin is not an admin and has no admin id", async () => {
    const off = { ...admin, disabledAt: new Date() };
    expect(await guardsFor(off).isAdmin(request())).toBe(false);
    expect(await guardsFor(off).adminId(request())).toBeNull();
  });

  it("an owner with an empty tenant id is not signed in", async () => {
    expect(await guardsFor({ ...owner, tenantId: "" }).currentUser(request())).toBeNull();
  });
});
