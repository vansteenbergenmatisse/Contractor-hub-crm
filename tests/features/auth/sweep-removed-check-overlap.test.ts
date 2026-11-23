import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HighLevelUser } from "@/features/highlevel";
import { createGuards, createRemovedUserCheck, deactivateGhlUser, handleSetTenantLogin, type ProvisionDeps, type SessionUser } from "@/features/auth";
import { syncTenantUsers } from "@/features/onboarding";

// Re-review of the bug sweep: a list that shares no id with the tenant's active links says nothing
// about who left, so it must not block anyone. The real sync and deactivate run on in-memory stores.
type User = { id: string; name: string; role: "owner" | "office"; tenantId: string; disabledAt: Date | null; email: string };
type Link = { tenantId: string; ghlUserId: string; userId: string; deletedAt: Date | null };
const NOW = new Date("2026-11-23T10:00:00.000Z");
const ORIGIN = "https://crm.example.test";
const admin: SessionUser = { id: "a1", email: "a@x.test", name: "A", role: "admin", tenantId: null };
const hl = (id: string, over: Partial<HighLevelUser> = {}): HighLevelUser => ({ id, email: `${id}@x.test`, name: id, deleted: false, roleType: "account", role: "user", locationIds: [], ...over });
const person = (id: string): User => ({ id, name: id, role: "owner", tenantId: "T1", disabledAt: NOW, email: `${id}@x.test` });
const link = (id: string): Link => ({ tenantId: "T1", ghlUserId: `g-${id}`, userId: id, deletedAt: null });

let users: User[];
let links: Link[];
let deps: ProvisionDeps;
const user = (id: string) => users.find((u) => u.id === id) as User;
const markOf = (id: string) => links.find((l) => l.userId === id)?.deletedAt;

async function turnOn(list: HighLevelUser[]) {
  const afterTurnOn = createRemovedUserCheck({
    readUsers: async () => list,
    syncUsers: syncTenantUsers,
    deactivate: (tenantId, ghlUserId) => deactivateGhlUser(deps, tenantId, ghlUserId),
    activeLinks: async (tenantId) => links.filter((l) => l.tenantId === tenantId && !l.deletedAt),
  });
  return handleSetTenantLogin(
    new Request(`${ORIGIN}/x`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ disabled: false }) }),
    "T1",
    {
      guards: createGuards({ getSession: async () => admin }),
      listUserIds: async () => users.map((u) => u.id),
      setUserDisabled: async (id, off) => { user(id).disabledAt = off ? NOW : null; },
      limiter: async () => true,
      appOrigin: ORIGIN,
      afterTurnOn,
    },
  );
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  users = [person("solo")];
  links = [link("solo")];
  deps = {
    createUser: vi.fn(async () => ({ userId: "new" })),
    updateUser: vi.fn(async () => {}),
    setDisabled: vi.fn(async (id, off) => { user(id).disabledAt = off ? NOW : null; }),
    sendSetPassword: vi.fn(async () => {}),
    randomPassword: () => "x".repeat(40),
    store: {
      findLink: async (t, g) => links.find((l) => l.tenantId === t && l.ghlUserId === g) ?? null,
      findLinkByUserId: async (u) => links.find((l) => l.userId === u) ?? null,
      relinkUser: vi.fn(async () => {}),
      insertLink: vi.fn(async () => {}),
      setLinkDeleted: async (t, g, d) => { for (const l of links) if (l.tenantId === t && l.ghlUserId === g) l.deletedAt = d; },
      findUserByEmail: async (e) => users.find((u) => u.email === e) ?? null,
      findUserById: async (id) => users.find((u) => u.id === id) ?? null,
    },
    now: () => NOW,
  };
});

describe("the turn-on check needs a list that overlaps the active links", () => {
  it("a non-empty list with no overlap blocks nobody, and the turn-on still succeeds", async () => {
    const response = await turnOn([hl("g-stranger")]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ affected: 1, removedCheck: "failed" });
    expect(user("solo").disabledAt).toBeNull();
    expect(markOf("solo")).toBeNull();
    expect(deps.setDisabled).not.toHaveBeenCalled();
  });

  it("a linked id listed only as deleted is no overlap", async () => {
    const response = await turnOn([hl("g-solo", { deleted: true }), hl("g-stranger")]);
    expect(await response.json()).toEqual({ affected: 1, removedCheck: "failed" });
    expect(user("solo").disabledAt).toBeNull();
    expect(markOf("solo")).toBeNull();
  });

  it("a list with an overlap still blocks a person who really left", async () => {
    users.push(person("gone"));
    links.push(link("gone"));
    const response = await turnOn([hl("g-solo")]);
    expect(await response.json()).toEqual({ affected: 2 });
    expect(user("gone").disabledAt).toEqual(NOW);
    expect(markOf("gone")).toEqual(NOW);
    expect(user("solo").disabledAt).toBeNull();
  });

  it("a sole user listed without an email is present and is not blocked", async () => {
    const response = await turnOn([hl("g-solo", { email: "" })]);
    expect(await response.json()).toEqual({ affected: 1 });
    expect(user("solo").disabledAt).toBeNull();
    expect(markOf("solo")).toBeNull();
  });

  it("a tenant with no active links blocks nobody", async () => {
    links = [];
    const response = await turnOn([hl("g-stranger")]);
    expect(await response.json()).toEqual({ affected: 1 });
    expect(user("solo").disabledAt).toBeNull();
    expect(deps.setDisabled).not.toHaveBeenCalled();
  });
});
