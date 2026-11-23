import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HighLevelUser } from "@/features/highlevel";
import { createGuards, createRemovedUserCheck, deactivateGhlUser, handleSetTenantLogin, type ProvisionDeps, type SessionUser } from "@/features/auth";
import { syncTenantUsers } from "@/features/onboarding";

// Review of the bug sweep: a person removed from HighLevel while login was off must not get access
// back when login is turned on. The real sync and the real deactivate run on in-memory stores.
type User = { id: string; name: string; role: "owner" | "office"; tenantId: string; disabledAt: Date | null; email: string };
type Link = { tenantId: string; ghlUserId: string; userId: string; deletedAt: Date | null };
const NOW = new Date("2026-11-23T10:00:00.000Z");
const ORIGIN = "https://crm.example.test";
const admin: SessionUser = { id: "a1", email: "a@x.test", name: "A", role: "admin", tenantId: null };
const hl = (id: string): HighLevelUser => ({ id, email: `${id}@x.test`, name: id, deleted: false, roleType: "account", role: "user", locationIds: [] });
const person = (id: string): User => ({ id, name: id, role: "office", tenantId: "T1", disabledAt: NOW, email: `${id}@x.test` });
const link = (id: string, deletedAt: Date | null = null): Link => ({ tenantId: "T1", ghlUserId: `g-${id}`, userId: id, deletedAt });

let users: User[];
let links: Link[];
let deps: ProvisionDeps;
const disabled = (id: string) => users.find((u) => u.id === id)?.disabledAt !== null;

function check(readUsers: (tenantId: string) => Promise<HighLevelUser[]>) {
  return createRemovedUserCheck({
    readUsers,
    syncUsers: syncTenantUsers,
    deactivate: (tenantId, ghlUserId) => deactivateGhlUser(deps, tenantId, ghlUserId),
    activeLinks: async (tenantId) => links.filter((l) => l.tenantId === tenantId && !l.deletedAt),
  });
}

async function turnOn(afterTurnOn: (tenantId: string) => Promise<boolean>) {
  return handleSetTenantLogin(
    new Request(`${ORIGIN}/x`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ disabled: false }) }),
    "T1",
    {
      guards: createGuards({ getSession: async () => admin }),
      listUserIds: async () => users.filter((u) => !links.some((l) => l.userId === u.id && l.deletedAt)).map((u) => u.id),
      setUserDisabled: async (id, off) => { (users.find((u) => u.id === id) as User).disabledAt = off ? NOW : null; },
      limiter: async () => true,
      appOrigin: ORIGIN,
      afterTurnOn,
    },
  );
}

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  users = [person("stay"), person("gone")];
  links = [link("stay"), link("gone")];
  deps = {
    createUser: vi.fn(async () => ({ userId: "new" })),
    updateUser: vi.fn(async () => {}),
    setDisabled: vi.fn(async (id, off) => { (users.find((u) => u.id === id) as User).disabledAt = off ? NOW : null; }),
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

describe("turning login on re-checks who HighLevel still lists", () => {
  it("blocks and marks a person removed while login was off, and keeps the others on", async () => {
    const response = await turnOn(check(async () => [hl("g-stay")]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ affected: 2 });
    expect(disabled("gone")).toBe(true);
    expect(links.find((l) => l.userId === "gone")?.deletedAt).toEqual(NOW);
    expect(disabled("stay")).toBe(false);
  });

  it("a failed read blocks nobody, keeps the turn-on and tells the admin", async () => {
    const response = await turnOn(check(async () => { throw new Error("hl down"); }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ affected: 2, removedCheck: "failed" });
    expect(disabled("stay")).toBe(false);
    expect(disabled("gone")).toBe(false);
  });

  it("an empty list blocks nobody and counts as a failed check", async () => {
    const response = await turnOn(check(async () => []));
    expect(await response.json()).toEqual({ affected: 2, removedCheck: "failed" });
    expect(disabled("gone")).toBe(false);
  });

  it("a list that would block more than half blocks nobody and counts as a failed check", async () => {
    users = ["a", "b", "c", "d", "e", "f"].map(person);
    links = users.map((u) => link(u.id));
    const response = await turnOn(check(async () => [hl("g-a")]));
    expect(await response.json()).toEqual({ affected: 6, removedCheck: "failed" });
    expect(users.every((u) => u.disabledAt === null)).toBe(true);
  });

  it("never disables an account without a HighLevel link", async () => {
    users.push(person("test-owner"));
    await turnOn(check(async () => [hl("g-stay")]));
    expect(disabled("test-owner")).toBe(false);
  });

  it("never restores, creates, links or mails anyone", async () => {
    users.push(person("back"));
    links.push(link("back", NOW));
    await turnOn(check(async () => [hl("g-stay"), hl("g-back"), hl("g-brand-new")]));
    expect(disabled("back")).toBe(true);
    expect(links.find((l) => l.userId === "back")?.deletedAt).toEqual(NOW);
    expect(deps.createUser).not.toHaveBeenCalled();
    expect(deps.sendSetPassword).not.toHaveBeenCalled();
    expect(deps.store.insertLink).not.toHaveBeenCalled();
    expect(deps.store.relinkUser).not.toHaveBeenCalled();
    expect(deps.updateUser).not.toHaveBeenCalled();
  });

  it("asks the sync to deactivate and never to restore", async () => {
    const syncUsers = vi.fn(async () => ({ failed: 0, suspicious: 0 }));
    const run = createRemovedUserCheck({ readUsers: async () => [hl("g-stay")], syncUsers, deactivate: async () => false, activeLinks: async () => [] });
    expect(await run("T1")).toBe(true);
    expect(syncUsers).toHaveBeenCalledWith(expect.anything(), "T1", [hl("g-stay")], { mayDeactivate: true, mayRestore: false });
  });

  it("a block that fails during the check is reported", async () => {
    vi.mocked(deps.setDisabled).mockRejectedValueOnce(new Error("db down"));
    const response = await turnOn(check(async () => [hl("g-stay")]));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ affected: 2, removedCheck: "failed" });
  });

  it("the turn-on survives a follow-up that throws", async () => {
    const response = await turnOn(async () => { throw new Error("boom"); });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ affected: 2, removedCheck: "failed" });
  });

  it("does not run the follow-up when login is turned off", async () => {
    const afterTurnOn = vi.fn(async () => true);
    await handleSetTenantLogin(
      new Request(`${ORIGIN}/x`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ disabled: true }) }),
      "T1",
      { guards: createGuards({ getSession: async () => admin }), listUserIds: async () => ["stay"], setUserDisabled: async () => {}, limiter: async () => true, appOrigin: ORIGIN, afterTurnOn },
    );
    expect(afterTurnOn).not.toHaveBeenCalled();
  });
});
