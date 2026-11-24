import { beforeEach, describe, expect, it, vi } from "vitest";

// Wave E review fixes for the admin values route and loader. Mocked database and HighLevel only.
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

import { buildAdminValuesView, handleAdminValues, loadAdminValues, type AdminValuesRouteDeps } from "@/features/admin-values";
import { writeGuardOf } from "@/features/settings";

const ORIGIN = "https://crm.example.test";
const deps = () => ({
  appOrigin: ORIGIN,
  adminId: vi.fn(async () => "A1"),
  isViewing: vi.fn(async () => false),
  limiter: vi.fn(async () => true),
  isConnected: vi.fn(async () => true),
  isEnabled: vi.fn(() => true),
  save: vi.fn<AdminValuesRouteDeps["save"]>(async (input) => ({ results: input.changes.map(({ key }) => ({ key, status: "saved" as const })) })),
  lock: vi.fn<AdminValuesRouteDeps["lock"]>(async () => {}),
  unlock: vi.fn<AdminValuesRouteDeps["unlock"]>(async () => {}),
}) satisfies AdminValuesRouteDeps;
const HEADERS = { origin: ORIGIN, "content-type": "application/json" };
const post = (body: BodyInit, headers: Record<string, string> = HEADERS) =>
  new Request(`${ORIGIN}/api/admin/clients/T1/values`, { method: "POST", headers, body, duplex: "half" } as RequestInit);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("lock requests", () => {
  it("refuses to lock a secret key: it is always hidden from the owner, so already locked", async () => {
    const d = deps();
    const response = await handleAdminValues(post(JSON.stringify({ action: "lock", key: "0_webhook_url_form" })), "T1", d);
    expect(response.status).toBe(400);
    expect(d.lock).not.toHaveBeenCalled();
  });

  it("still unlocks a secret key, so an old row can be removed", async () => {
    const d = deps();
    expect((await handleAdminValues(post(JSON.stringify({ action: "unlock", key: "0_webhook_url_form" })), "T1", d)).status).toBe(200);
    expect(d.unlock).toHaveBeenCalledWith("T1", "0_webhook_url_form");
  });
});

describe("body size", () => {
  it("stops reading an oversized body at the limit instead of buffering it whole", async () => {
    let pulled = 0;
    const chunk = new TextEncoder().encode("x".repeat(4096));
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 1000) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const d = deps();
    const response = await handleAdminValues(post(stream), "T1", d);
    expect(response.status).toBe(400);
    expect(pulled).toBeLessThan(20);
    expect(d.isConnected).not.toHaveBeenCalled();
  });

  it("refuses a declared length over the limit without reading", async () => {
    const d = deps();
    const response = await handleAdminValues(post("{}", { ...HEADERS, "content-length": String(1024 * 1024) }), "T1", d);
    expect(response.status).toBe(400);
  });
});

describe("loadAdminValues", () => {
  beforeEach(() => {
    connectedTenant.mockResolvedValue({ name: "Acme" });
    read.mockResolvedValue({ ok: true, values: [{ id: "1", key: "business_name", name: "n", value: "Test Co" }] });
    lockedKeysOf.mockResolvedValue(new Set(["business_name"]));
    isWriteBackEnabled.mockReturnValue(true);
  });

  it("answers null for a tenant id that is not well formed, and reads nothing", async () => {
    expect(await loadAdminValues("../x")).toBeNull();
    expect(connectedTenant).not.toHaveBeenCalled();
  });

  it("passes the write-back flag of that tenant", async () => {
    isWriteBackEnabled.mockReturnValue(false);
    const view = await loadAdminValues("T1");
    expect(isWriteBackEnabled).toHaveBeenCalledWith("T1");
    expect(view?.writable).toBe(false);
    expect(view?.folders.flatMap((f) => f.groups.flatMap((g) => g.rows)).find((r) => r.key === "business_name")?.locked).toBe(true);
  });

  it("shows the load error instead of failing the page when the locks cannot be read", async () => {
    lockedKeysOf.mockRejectedValue(new Error("db"));
    const view = await loadAdminValues("T1");
    expect(view).toMatchObject({ tenantId: "T1", clientName: "Acme", loadError: "retry", folders: [] });
  });
});

describe("buildAdminValuesView marks page text the owner only reads", () => {
  it("sets ownerReadOnly on a page-text key outside a protected folder, not on an open key", () => {
    expect(writeGuardOf("about_page_content").kind).toBe("read-only");
    const view = buildAdminValuesView({
      tenantId: "T1", clientName: "Acme", locked: new Set(), writable: true,
      read: { ok: true, values: [{ id: "1", key: "business_name", name: "n", value: "Test Co" }, { id: "2", key: "about_page_content", name: "n", value: "Hello" }] },
    });
    const rows = view.folders.flatMap((f) => f.groups.flatMap((g) => g.rows));
    expect(rows.find((r) => r.key === "about_page_content")?.ownerReadOnly).toBe(true);
    expect(rows.find((r) => r.key === "business_name")?.ownerReadOnly).toBeUndefined();
  });
});
