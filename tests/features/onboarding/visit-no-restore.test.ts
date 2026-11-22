import { afterEach, describe, expect, it, vi } from "vitest";
import type { HighLevelUser } from "@/features/highlevel";
import { syncTenantUsers, syncUsersOnVisit, type UserSyncDeps } from "@/features/onboarding";

const ghl: HighLevelUser = { id: "g1", email: "g1@x.test", name: "G", deleted: false, roleType: "account", role: "user", locationIds: [] };

function deps(): UserSyncDeps {
  return {
    provision: vi.fn(async () => ({ outcome: "skipped_removed" as const, userId: null })),
    deactivate: vi.fn(async () => true),
    activeLinks: vi.fn(async () => []),
  };
}

describe("restore rights by path", () => {
  afterEach(() => vi.restoreAllMocks());

  it("the visit path asks provisioning not to restore, and logs only a count", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const d = deps();
    const counts = await syncUsersOnVisit(d, "tenant-secret-id", [ghl]);
    expect(d.provision).toHaveBeenCalledWith(expect.objectContaining({ mayRestore: false }));
    expect(counts.restored).toBe(0);
    expect(counts.skippedConflict).toBe(0);
    const logged = JSON.stringify(info.mock.calls);
    expect(logged).toContain("restoreSkipped=1");
    expect(logged).not.toContain("tenant-secret-id");
    expect(logged).not.toContain("g1");
  });

  it("the default path (webhook and cron) does not limit restoring", async () => {
    const d = deps();
    vi.mocked(d.provision).mockResolvedValue({ outcome: "restored", userId: "u" });
    await syncTenantUsers(d, "t1", [ghl]);
    expect(vi.mocked(d.provision).mock.calls[0][0].mayRestore).toBeUndefined();
  });
});
