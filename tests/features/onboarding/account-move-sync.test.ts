import { afterEach, describe, expect, it, vi } from "vitest";
import type { HighLevelUser } from "@/features/highlevel";
import { addCounts, emptyUserCounts, syncTenantUsers, syncUsersOnVisit, type UserSyncDeps } from "@/features/onboarding";

import { withSyncMoveProof } from "../../../src/features/onboarding/api/users";

const ghl: HighLevelUser = { id: "ghl-private", email: "pat.private@example.test", name: "Pat", deleted: false, roleType: "account", role: "user", locationIds: [] };
const deps = (result: Awaited<ReturnType<UserSyncDeps["provision"]>>): UserSyncDeps => ({
  provision: vi.fn(async () => result),
  deactivate: vi.fn(async () => true),
  activeLinks: vi.fn(async () => []),
});

afterEach(() => vi.restoreAllMocks());

describe("account moves in the user sync", () => {
  it("counts a moved account apart from a conflict", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const counts = await syncTenantUsers(deps({ outcome: "moved", userId: "u" }), "t1", [ghl]);
    expect(counts).toMatchObject({ moved: 1, skippedConflict: 0 });
    expect(addCounts(counts, counts).moved).toBe(2);
    expect(emptyUserCounts().moved).toBe(0);
  });

  it("logs conflict counts per reason code, with no personal data", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const d = deps({ outcome: "skipped_conflict", userId: null, reason: "used" });
    const counts = await syncTenantUsers(d, "tenant-private", [ghl, { ...ghl, id: "ghl-2" }]);
    expect(counts.skippedConflict).toBe(2);
    const line = info.mock.calls.map((c) => String(c[0])).find((l) => l.includes("email_conflicts")) ?? "";
    expect(JSON.parse(line)).toEqual({ audit: "email_conflicts", moved: 0, reasons: { used: 2 } });
    for (const secret of ["pat.private", "ghl-private", "tenant-private"]) expect(line).not.toContain(secret);
  });

  it("the visit sync passes no move proof and asks for no restore", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const d = deps({ outcome: "skipped_conflict", userId: null, reason: "no_proof" });
    await syncUsersOnVisit(d, "t1", [ghl]);
    const input = vi.mocked(d.provision).mock.calls[0][0];
    expect(input.mayRestore).toBe(false);
    expect(input.moveProof).toBeUndefined();
  });

  it("the sync wiring gives a proof that reports A's list as incomplete until HighLevel can prove it", async () => {
    const input = { tenantId: "t", ghlUserId: "g", email: "e@example.test", name: null, ghlRole: null, ghlRoleType: null };
    const proof = withSyncMoveProof(input).moveProof;
    expect(proof?.kind).toBe("sync");
    if (proof?.kind === "sync") expect(await proof.readSourceEmails("tenant-a")).toEqual({ complete: false });
  });

  it("the sync wiring gives the visit path no proof", () => {
    const input = { tenantId: "t", ghlUserId: "g", email: "e@example.test", name: null, ghlRole: null, ghlRoleType: null, mayRestore: false };
    expect(withSyncMoveProof(input).moveProof).toBeUndefined();
  });

  it("the default sync does not invent a proof either: the wiring supplies it", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const d = deps({ outcome: "exists", userId: "u" });
    await syncTenantUsers(d, "t1", [ghl]);
    expect(vi.mocked(d.provision).mock.calls[0][0].moveProof).toBeUndefined();
  });
});
