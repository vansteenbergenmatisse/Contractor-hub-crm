import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Behavioral wiring of the on-demand reconcile (replaces the old source-string checks): the real
// scheduleTokenRenewal, the real check route file and the real runSync, with only the edges faked:
// Next.js `after`, the shared rate limit (in memory), the session, and the HighLevel API.
const ORIGIN = "https://crm.example.test";

const state = vi.hoisted(() => ({
  tasks: [] as Array<() => Promise<void>>,
  limits: new Map<string, { count: number; start: number }>(),
  hits: [] as Array<{ key: string; windowMs: number }>,
  viewing: false,
  admin: "admin_1" as string | null,
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => {
    state.tasks.push(task);
  },
}));

const fakeHitRateLimit = vi.hoisted(() => async (key: string, limit: number, windowMs: number, now: Date) => {
  state.hits.push({ key, windowMs });
  const row = state.limits.get(key);
  if (!row || row.start < now.getTime() - windowMs) {
    state.limits.set(key, { count: 1, start: now.getTime() });
    return 1 <= limit;
  }
  row.count += 1;
  return row.count <= limit;
});

const sendMail = vi.hoisted(() => vi.fn(async () => ({ delivered: true })));

vi.mock("@/features/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth")>()),
  hitRateLimit: fakeHitRateLimit,
  clearRateLimit: async () => {},
  getGuards: () => ({ adminId: async () => state.admin, currentUser: async () => null, isAdmin: async () => false, tenantOf: async () => { throw new Error("no"); } }),
  currentUserFromHeaders: async () => (state.admin ? { id: state.admin, role: "admin", viewing: state.viewing } : null),
  getProvisionDeps: () => ({ sendSetPassword: async () => {} }),
  provisionGhlUser: vi.fn(async () => ({ outcome: "exists", userId: "u" })),
  deactivateGhlUser: vi.fn(async () => true),
  listActiveLinks: async () => [],
  createEmailSenderFromEnv: () => ({ send: sendMail }),
}));

const hl = vi.hoisted(() => ({
  connect: vi.fn<(locationId: string, name: string | null, listedAt?: Date) => Promise<{ tenantId: string; accessToken: string }>>(async () => ({ tenantId: "t_new", accessToken: "tok" })),
  locations: vi.fn(async () => [{ locationId: "loc_other", name: "Other", email: null }]),
  usersOfTenant: vi.fn<(tenantId: string) => Promise<never[]>>(async () => []),
}));

vi.mock("@/features/highlevel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/highlevel")>()),
  runTokenRenewal: vi.fn(async () => {}),
  getOnboardingApi: () => ({
    companyIds: async () => ["co_1"],
    agency: async () => ({
      installed: async () => [
        { locationId: "loc_known", name: "Known" },
        { locationId: "loc_new", name: "New" },
      ],
      locations: hl.locations,
      connect: hl.connect,
    }),
    connectedTenants: async () => [{ tenantId: "t_known", locationId: "loc_known" }],
    usersOfTenant: hl.usersOfTenant,
    usersWithToken: async () => [],
    saveLocationToken: async () => ({ tenantId: "t" }),
  }),
}));

vi.mock("@/shared/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/shared/config")>()),
  parseEnv: () => ({ APP_URL: ORIGIN }),
}));

import { scheduleTokenRenewal, ADMIN_RECONCILE_INTERVAL_MS, MANUAL_CHECK_AGENCY_INTERVAL_MS } from "@/features/onboarding";
import { POST } from "../../../src/app/api/admin/sub-accounts/check/route";

async function runTasks() {
  const tasks = state.tasks.splice(0);
  for (const task of tasks) await task();
}

const post = (origin = ORIGIN) => POST(new Request(`${ORIGIN}/api/admin/sub-accounts/check`, { method: "POST", headers: { origin } }));

beforeEach(() => {
  state.tasks = [];
  state.limits.clear();
  state.hits = [];
  state.viewing = false;
  state.admin = "admin_1";
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("admin visit to /admin/clients (scheduleTokenRenewal)", () => {
  it("connects the new listed sub-account with the run start as listedAt, re-reads known users, mails nobody", async () => {
    const before = Date.now();
    scheduleTokenRenewal();
    await runTasks();
    expect(hl.connect).toHaveBeenCalledTimes(1);
    const [locationId, name, listedAt] = hl.connect.mock.calls[0];
    expect([locationId, name]).toEqual(["loc_new", "New"]);
    expect(listedAt).toBeInstanceOf(Date);
    expect((listedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect(hl.usersOfTenant).toHaveBeenCalledWith("t_known");
    expect(hl.locations).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("claims the agency and the tenant user re-read with the 5-minute window", async () => {
    scheduleTokenRenewal();
    await runTasks();
    expect(state.hits).toContainEqual({ key: "agency-reconcile:co_1", windowMs: ADMIN_RECONCILE_INTERVAL_MS });
    expect(state.hits).toContainEqual({ key: "tenant-user-resync:t_known", windowMs: ADMIN_RECONCILE_INTERVAL_MS });
    expect(ADMIN_RECONCILE_INTERVAL_MS).toBe(5 * 60_000);
  });

  it("a second visit within 5 minutes neither reconnects nor re-reads users", async () => {
    scheduleTokenRenewal();
    await runTasks();
    hl.connect.mockClear();
    hl.usersOfTenant.mockClear();
    scheduleTokenRenewal();
    await runTasks();
    expect(hl.connect).not.toHaveBeenCalled();
    expect(hl.usersOfTenant).not.toHaveBeenCalled();
  });

  it("a tenant whose users were re-read less than 5 minutes ago is skipped even when the agency is due", async () => {
    await fakeHitRateLimit("tenant-user-resync:t_known", 1, ADMIN_RECONCILE_INTERVAL_MS, new Date());
    scheduleTokenRenewal();
    await runTasks();
    expect(hl.connect).toHaveBeenCalledTimes(1);
    expect(hl.usersOfTenant).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/sub-accounts/check (the real route file)", () => {
  it("connects new sub-accounts only, leaves known users alone and reports counts", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: 1, installed: 2, agencies: 1, failures: 0, throttled: 0 });
    expect(hl.connect).toHaveBeenCalledTimes(1);
    expect(hl.usersOfTenant).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
    expect(state.hits).toContainEqual({ key: "agency-reconcile:manual:admin_1", windowMs: 60_000 });
    expect(state.hits).toContainEqual({ key: "agency-reconcile:manual-agency:co_1", windowMs: MANUAL_CHECK_AGENCY_INTERVAL_MS });
  });

  it("a second click within a minute skips the agency and says so", async () => {
    await post();
    hl.connect.mockClear();
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connected: 0, installed: 0, agencies: 0, failures: 0, throttled: 1 });
    expect(hl.connect).not.toHaveBeenCalled();
  });

  it("still works right after the page's own background run (separate, shorter agency window)", async () => {
    scheduleTokenRenewal();
    await runTasks();
    const response = await post();
    expect((await response.json()).throttled).toBe(0);
  });

  it("is refused while the admin is in View as client, and nothing runs", async () => {
    state.viewing = true;
    const response = await post();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "viewing" });
    expect(hl.connect).not.toHaveBeenCalled();
    expect(state.hits.some((h) => h.key.startsWith("agency-reconcile:manual:"))).toBe(false);
  });

  it("refuses a non-admin and another origin", async () => {
    expect((await post("https://evil.example.test")).status).toBe(403);
    state.admin = null;
    expect((await post()).status).toBe(403);
    expect(hl.connect).not.toHaveBeenCalled();
  });
});
