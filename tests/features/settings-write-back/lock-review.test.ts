import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomValueDetail } from "@/features/highlevel";

// Wave E review fixes: lock enforcement must not depend on optional wiring that no test guards.
// Mocked HighLevel and database only. All values are fake.
const { lockedKeysOf, findMany, adapter, media } = vi.hoisted(() => ({
  lockedKeysOf: vi.fn<(tenantId: string) => Promise<ReadonlySet<string>>>(),
  findMany: vi.fn(),
  adapter: { read: vi.fn(), readAll: vi.fn(), update: vi.fn() },
  media: { find: vi.fn(), verify: vi.fn(), trash: vi.fn(), upload: vi.fn() },
}));

vi.mock("@/features/highlevel", () => ({
  createTenantCustomValueAdapter: () => adapter,
  createTenantMediaAdapter: () => media,
  fetchMediaBytes: vi.fn(),
}));
vi.mock("@/features/brand", () => ({ allowedLogoHosts: () => ["files.leadconnectorhq.com"], getBrandService: () => ({ expire: vi.fn() }), isAllowedLogoUrl: () => true }));
vi.mock("../../../src/features/settings-write-back/db/save-lock", () => ({ claimSaveLock: vi.fn(async () => "holder"), releaseSaveLock: vi.fn(async () => {}) }));
vi.mock("../../../src/features/settings-write-back/db/value-changes", () => ({ beginValueChange: vi.fn(async () => "audit-1"), finishValueChange: vi.fn(async () => {}) }));
vi.mock("../../../src/features/settings-write-back/db/value-locks", () => ({ lockedKeysOf, lockValue: vi.fn(), unlockValue: vi.fn() }));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => ({ customValueLock: { findMany } }) }));

import { handleSaveValues, loadLockedKeys, replaceImage, saveTenantValues, type MediaDeps } from "@/features/settings-write-back";
import { replaceTenantImage } from "../../../src/features/settings-write-back/api/media-instance";

const KEY = "1_our_work_after";
const OLD = "https://files.leadconnectorhq.com/x/old.webp";
const BYTES = new Uint8Array([1, 2, 3, 4]);
const FILE = { bytes: BYTES, contentType: "image/webp", extension: "webp", hash: createHash("sha256").update(BYTES).digest("hex") };
const row = (key: string, value: string): CustomValueDetail => ({ id: `id-${key}`, key, name: `Name ${key}`, value });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  adapter.read.mockResolvedValue({ ok: true, values: [row("business_name", "Test Co"), row(KEY, OLD)] });
  adapter.update.mockResolvedValue("saved");
});

describe("the real owner save reads the tenant's locks", () => {
  it("refuses a locked key and writes nothing", async () => {
    lockedKeysOf.mockResolvedValue(new Set(["business_name"]));
    const out = await saveTenantValues({ tenantId: "T1", actorId: "U1", changes: [{ key: "business_name", expected: "Test Co", value: "New Co" }] });
    expect(lockedKeysOf).toHaveBeenCalledWith("T1");
    expect(out.results).toEqual([{ key: "business_name", status: "locked" }]);
    expect(adapter.update).not.toHaveBeenCalled();
  });
});

describe("the real Change image reads the tenant's locks under the save lease", () => {
  it("answers locked and uploads or writes nothing for a key locked meanwhile", async () => {
    lockedKeysOf.mockResolvedValue(new Set([KEY]));
    const answer = await replaceTenantImage({ tenantId: "T1", actorId: "U1", key: KEY, expected: OLD, file: FILE });
    expect(answer).toEqual({ status: "locked" });
    expect(lockedKeysOf).toHaveBeenCalledWith("T1");
    expect(media.upload).not.toHaveBeenCalled();
    expect(adapter.update).not.toHaveBeenCalled();
  });
});

describe("replaceImage and locks", () => {
  const deps = (locks: MediaDeps["locks"]) => ({
    read: vi.fn<MediaDeps["read"]>(async () => ({ ok: true, values: [row(KEY, OLD)] })),
    update: vi.fn<MediaDeps["update"]>(async () => "saved"),
    begin: vi.fn<MediaDeps["begin"]>(async () => "audit-1"),
    finish: vi.fn<MediaDeps["finish"]>(async () => {}),
    invalidate: vi.fn<MediaDeps["invalidate"]>(),
    claim: vi.fn<MediaDeps["claim"]>(async () => "holder"),
    release: vi.fn<MediaDeps["release"]>(async () => {}),
    now: () => 0,
    find: vi.fn<MediaDeps["find"]>(async () => ({ ok: true, files: [{ id: "old", name: "a.webp", url: OLD, parentId: "f" }], siblings: [] })),
    verify: vi.fn<MediaDeps["verify"]>(async () => true),
    trash: vi.fn<MediaDeps["trash"]>(async () => "trashed"),
    upload: vi.fn<MediaDeps["upload"]>(async () => ({ kind: "uploaded", fileId: "f1", url: "https://files.leadconnectorhq.com/x/new" })),
    fetchBytes: vi.fn<MediaDeps["fetchBytes"]>(async () => new Uint8Array([9])),
    readAll: vi.fn<MediaDeps["readAll"]>(async () => ({ ok: true, rows: [] })),
    hosts: ["files.leadconnectorhq.com"],
    locks,
  });
  const run = (d: MediaDeps) => replaceImage({ tenantId: "T1", actorId: "U1", key: KEY, expected: OLD, file: FILE }, d);

  it("stops with locked before any upload when the key is locked", async () => {
    const d = deps(vi.fn(async () => new Set([KEY])));
    expect(await run(d)).toEqual({ status: "locked" });
    expect(d.locks).toHaveBeenCalledWith("T1");
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
    expect(d.release).toHaveBeenCalled();
  });

  it("answers retry and uploads nothing when the locks cannot be read", async () => {
    const d = deps(vi.fn(async () => { throw new Error("db"); }));
    expect(await run(d)).toEqual({ status: "retry" });
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.update).not.toHaveBeenCalled();
  });

  it("answers locked when the lock lands between the first check and the write", async () => {
    let reads = 0;
    const d = deps(vi.fn(async () => ((reads += 1) === 1 ? new Set<string>() : new Set([KEY]))));
    const answer = await run(d);
    expect(answer.status).toBe("locked");
    expect(d.update).not.toHaveBeenCalled();
  });
});

describe("the owner's save route", () => {
  it.each([["admin"], ["owner"]])("refuses a body naming scope %s, so an owner never gets an admin save", async (scope) => {
    const ORIGIN = "https://crm.example.test";
    const save = vi.fn(async () => ({ results: [] }));
    const request = new Request(`${ORIGIN}/api/settings/values`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ changes: [{ key: "business_name", expected: "Test Co", value: "New Co" }], scope }),
    });
    const response = await handleSaveValues(request, {
      appOrigin: ORIGIN,
      currentUser: async () => ({ id: "U1", role: "owner", tenantId: "T1" }),
      isEnabled: () => true,
      hit: async () => true,
      save,
    });
    expect(response.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("loadLockedKeys", () => {
  it("marks nothing locked when the locks cannot be read", async () => {
    lockedKeysOf.mockRejectedValue(new Error("db"));
    expect(await loadLockedKeys("T1")).toEqual([]);
  });

  it("sends only the names of keys the owner is shown, never a hidden key's name", async () => {
    lockedKeysOf.mockResolvedValue(new Set(["business_name", "0_webhook_url_form", "location_api_key"]));
    expect(await loadLockedKeys("T1")).toEqual(["business_name"]);
  });
});

describe("lockedKeysOf (db)", () => {
  it("reads one tenant's rows only, so a lock for tenant A never affects tenant B", async () => {
    const real = await vi.importActual<typeof import("../../../src/features/settings-write-back/db/value-locks")>("../../../src/features/settings-write-back/db/value-locks");
    findMany.mockResolvedValue([{ key: "business_name" }]);
    expect([...(await real.lockedKeysOf("T2"))]).toEqual(["business_name"]);
    expect(findMany).toHaveBeenCalledWith({ where: { tenantId: "T2" }, select: { key: true } });
  });
});
