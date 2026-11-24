import { beforeEach, describe, expect, it, vi } from "vitest";

// A database without the CustomValueLock table (its migration not applied there yet). Prisma answers
// P2021. The owner gets "update pending" once, nothing is read from or written to HighLevel.
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({ customValueLock: { findMany, upsert: findMany, deleteMany: findMany } }) }));

import {
  CUSTOM_VALUE_LOCK_MIGRATION,
  MigrationPendingError,
  handleMediaReplace,
  isMigrationPendingError,
  loadLockedKeys,
  lockedKeysOf,
  lockValue,
  saveCustomValues,
  type MediaRouteDeps,
  type SaveDeps,
} from "@/features/settings-write-back";
import { saveProblem } from "@/features/settings";
import { imageMessage } from "../../../src/features/settings/api/image-messages";
import { lossy } from "./webp-fixtures";

const MIGRATION = "20261124120000_custom_value_lock";
const LOG = `Settings save failed: step=locks reason=migration_pending migration=${MIGRATION}`;
const OWNER_TEXT = "Database update pending. Your change was not saved. Forge Forward is finishing an update; try again later.";
const p2021 = () => Object.assign(new Error("The table `public.CustomValueLock` does not exist in the current database."), { code: "P2021" });

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("lockedKeysOf on a database without the lock table", () => {
  it("names the lock migration", () => {
    expect(CUSTOM_VALUE_LOCK_MIGRATION).toBe(MIGRATION);
  });

  it("turns P2021 into MigrationPendingError naming the migration", async () => {
    findMany.mockRejectedValue(p2021());
    const error = await lockedKeysOf("T1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MigrationPendingError);
    expect(isMigrationPendingError(error) && error.migration).toBe(MIGRATION);
  });

  it("does the same for a lock write", async () => {
    findMany.mockRejectedValue(p2021());
    await expect(lockValue("T1", "business_name", "A1")).rejects.toBeInstanceOf(MigrationPendingError);
  });

  it("loadLockedKeys shows no locks and logs one line naming the migration", async () => {
    findMany.mockRejectedValue(p2021());
    expect(await loadLockedKeys("T1")).toEqual([]);
    expect(errors.mock.calls).toEqual([[`Settings locks did not load: step=read reason=migration_pending migration=${MIGRATION}`]]);
  });

  it("leaves every other error unchanged", async () => {
    const other = Object.assign(new Error("connection"), { code: "P1001" });
    findMany.mockRejectedValue(other);
    await expect(lockedKeysOf("T1")).rejects.toBe(other);
  });
});

function saveDeps() {
  return {
    locks: vi.fn(async () => { throw new MigrationPendingError(MIGRATION); }),
    read: vi.fn<SaveDeps["read"]>(),
    update: vi.fn<SaveDeps["update"]>(),
    begin: vi.fn<SaveDeps["begin"]>(),
    finish: vi.fn<SaveDeps["finish"]>(),
    invalidate: vi.fn(),
    claim: vi.fn(async () => "holder"),
    release: vi.fn(async () => {}),
    now: () => 0,
  };
}

describe("owner save with the lock table missing", () => {
  it("answers pending_update for every key, reads and writes nothing, logs one line", async () => {
    const deps = saveDeps();
    const { results } = await saveCustomValues(
      { tenantId: "T1", actorId: "U1", changes: [{ key: "business_name", expected: "A", value: "B" }, { key: "business_phone", expected: "1", value: "2" }] },
      deps,
    );
    expect(results).toEqual([{ key: "business_name", status: "pending_update" }, { key: "business_phone", status: "pending_update" }]);
    expect(deps.read).not.toHaveBeenCalled();
    expect(deps.update).not.toHaveBeenCalled();
    expect(deps.begin).not.toHaveBeenCalled();
    expect(deps.release).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls).toEqual([[LOG]]);
  });

  it("still answers retry for any other lock read failure", async () => {
    const deps = { ...saveDeps(), locks: vi.fn(async () => { throw new Error("db"); }) };
    const { results } = await saveCustomValues({ tenantId: "T1", actorId: "U1", changes: [{ key: "business_name", expected: "A", value: "B" }] }, deps);
    expect(results).toEqual([{ key: "business_name", status: "retry" }]);
  });

  it("tells the owner the change was not saved and to try later", () => {
    expect(saveProblem([{ key: "business_name", status: "pending_update" }, { key: "business_phone", status: "pending_update" }])).toBe(OWNER_TEXT);
  });
});

describe("Change image with the lock table missing", () => {
  const ORIGIN = "https://app.example.test";
  function request() {
    const body = new FormData();
    body.append("key", "1_our_work_after");
    body.append("expected", "https://a.test/o.webp");
    body.append("file", new Blob([lossy(100, 100) as BlobPart], { type: "image/webp" }));
    return new Request(`${ORIGIN}/api/settings/media`, { method: "POST", headers: { origin: ORIGIN }, body });
  }

  it("answers pending_update, uploads nothing, logs one line", async () => {
    const deps = {
      appOrigin: ORIGIN,
      currentUser: vi.fn(async () => ({ id: "U1", role: "owner" as const, tenantId: "T1" })),
      isEnabled: vi.fn(() => true),
      hit: vi.fn(async () => true),
      replace: vi.fn<MediaRouteDeps["replace"]>(async () => ({ status: "saved" })),
      isLocked: vi.fn(async () => { throw new MigrationPendingError(MIGRATION); }),
    } satisfies MediaRouteDeps;
    const response = await handleMediaReplace(request(), deps);
    expect(await response.json()).toEqual({ status: "pending_update" });
    expect(deps.replace).not.toHaveBeenCalled();
    expect(errors.mock.calls).toEqual([[LOG]]);
  });

  it("shows the same words for an image", () => {
    expect(imageMessage("pending_update")).toBe(OWNER_TEXT);
  });
});
