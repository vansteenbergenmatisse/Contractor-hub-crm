// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MigrationPendingError } from "@/shared/lib/migration-pending";

// Admin values page on a database without the CustomValueLock table. Mocked database and HighLevel only.
const { connectedTenant, lockedKeysOf, isWriteBackEnabled, read } = vi.hoisted(() => ({
  connectedTenant: vi.fn(),
  lockedKeysOf: vi.fn(),
  isWriteBackEnabled: vi.fn(),
  read: vi.fn(),
}));

vi.mock("../../../src/features/admin-values/db/tenant", () => ({ connectedTenant }));
vi.mock("@/features/highlevel", () => ({ createTenantCustomValueAdapter: () => ({ read }) }));
vi.mock("@/features/auth", () => ({ clientViewCookieName: () => "view", currentUserFromHeaders: vi.fn(), getGuards: vi.fn(), hitRateLimit: vi.fn() }));
vi.mock("@/features/settings-write-back", () => ({ isWriteBackEnabled, lockedKeysOf, lockValue: vi.fn(), saveTenantValues: vi.fn(), unlockValue: vi.fn() }));

import { AdminValuesPage, loadAdminValues } from "@/features/admin-values";
import { render, screen } from "@testing-library/react";

const MIGRATION = "20261124120000_custom_value_lock";
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  connectedTenant.mockResolvedValue({ id: "T1", name: "Acme" });
  isWriteBackEnabled.mockReturnValue(true);
  read.mockResolvedValue({ ok: true, values: [{ id: "1", key: "business_name", name: "n", value: "Test Co" }] });
});

describe("loadAdminValues with the lock table missing", () => {
  it("shows pending_update naming the migration, no values, one log line", async () => {
    lockedKeysOf.mockRejectedValue(new MigrationPendingError(MIGRATION));
    const view = await loadAdminValues("T1");
    expect(view).toMatchObject({ tenantId: "T1", clientName: "Acme", loadError: "pending_update", pendingMigration: MIGRATION, folders: [] });
    expect(errors.mock.calls).toEqual([[`Admin values did not load: step=locks reason=migration_pending migration=${MIGRATION}`]]);
  });

  it("keeps retry for any other lock read failure", async () => {
    lockedKeysOf.mockRejectedValue(new Error("db"));
    expect(await loadAdminValues("T1")).toMatchObject({ loadError: "retry" });
  });

  it("says which migration is missing on the page", () => {
    render(<AdminValuesPage view={{ tenantId: "T1", clientName: "Acme", writable: true, loadError: "pending_update", pendingMigration: MIGRATION, folders: [] }} />);
    expect(screen.getByRole("alert").textContent).toContain(`Database update pending: ${MIGRATION} is not applied on this environment.`);
  });
});
