import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleAdminValues, type AdminValuesRouteDeps } from "@/features/admin-values";
import { MigrationPendingError } from "@/shared/lib/migration-pending";

// Lock and unlock on a database without the CustomValueLock table. Made-up values.
const ORIGIN = "https://crm.example.test";
const MIGRATION = "20261124120000_custom_value_lock";

function deps(fail: () => Promise<void>): AdminValuesRouteDeps {
  return { appOrigin: ORIGIN, adminId: async () => "A1", isViewing: async () => false, limiter: async () => true, isConnected: async () => true, isEnabled: () => true, save: vi.fn(), lock: fail, unlock: fail };
}
const post = (action: "lock" | "unlock") =>
  new Request(`${ORIGIN}/api/admin/clients/T1/values`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ action, key: "business_name" }) });

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("admin values route with the lock table missing", () => {
  it.each(["lock", "unlock"] as const)("%s answers pending_update (409, not 500) with one log line", async (action) => {
    const response = await handleAdminValues(post(action), "T1", deps(async () => { throw new MigrationPendingError(MIGRATION); }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "pending_update", migration: MIGRATION });
    expect(errors.mock.calls).toEqual([[`Admin value ${action} failed: reason=migration_pending migration=${MIGRATION}`]]);
  });

  it("rethrows any other lock error, so the caller still answers 500", async () => {
    const boom = new Error("db");
    await expect(handleAdminValues(post("lock"), "T1", deps(async () => { throw boom; }))).rejects.toBe(boom);
    expect(errors).not.toHaveBeenCalled();
  });
});
