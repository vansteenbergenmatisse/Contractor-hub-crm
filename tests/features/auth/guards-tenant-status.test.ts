import { describe, expect, it } from "vitest";
import { createGuards, type SessionUser } from "@/features/auth";

// A session of a tenant whose app was uninstalled in HighLevel stops working at once.
const owner: SessionUser = { id: "u1", email: "o@example.test", name: "O", role: "owner", tenantId: "A" };
const admin: SessionUser = { id: "a1", email: "a@example.test", name: "A", role: "admin", tenantId: null };
const request = () => new Request("https://app.example.test/x");

describe("uninstalled tenant", () => {
  it("is not signed in", async () => {
    const guards = createGuards({ getSession: async () => owner, isTenantUninstalled: async () => true });
    expect(await guards.currentUser(request())).toBeNull();
  });

  it("is checked with the session's tenant id", async () => {
    const seen: string[] = [];
    const guards = createGuards({
      getSession: async () => owner,
      isTenantUninstalled: async (id) => (seen.push(id), false),
    });
    expect(await guards.currentUser(request())).toEqual(owner);
    expect(seen).toEqual(["A"]);
  });

  it("fails closed when the status lookup throws", async () => {
    const guards = createGuards({
      getSession: async () => owner,
      isTenantUninstalled: async () => {
        throw new Error("db down");
      },
    });
    expect(await guards.currentUser(request())).toBeNull();
  });

  it("is never asked for an admin, who has no tenant", async () => {
    let asked = false;
    const guards = createGuards({
      getSession: async () => admin,
      isTenantUninstalled: async () => ((asked = true), true),
    });
    expect((await guards.currentUser(request()))?.role).toBe("admin");
    expect(asked).toBe(false);
  });
});
