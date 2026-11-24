import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailSenderFromEnv, type EmailMessage } from "@/features/auth";
import { emptyUserCounts, runSync, type SyncDeps } from "@/features/onboarding";
import { clearRateLimit } from "../../../src/features/auth/db/rate-limit";

const prisma = vi.hoisted(() => ({ rateLimit: { deleteMany: vi.fn(async () => ({ count: 1 })) } }));
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => prisma }));

const NOW = new Date("2026-11-23T05:00:00.000Z");
const ADMIN = "admin@example.test";
const item = (locationId: string) => ({ locationId, name: `Name ${locationId}` });

// One agency with one sub-account that lacks the app.
function missingDeps(over: Partial<SyncDeps> = {}): SyncDeps {
  return {
    now: () => NOW,
    companyIds: async () => ["co_a"],
    agency: async (companyId) => {
      const missing = companyId === "co_a" ? "loc_a" : "loc_b";
      return { installed: async () => [], locations: async () => [{ ...item(missing), email: null }] };
    },
    connectedTenants: async () => [],
    onboard: vi.fn(async () => ({ tenantId: "t_new", users: emptyUserCounts() })),
    resyncUsers: vi.fn(async () => emptyUserCounts()),
    claimAlerts: vi.fn(async (_c, missing) => [...missing]),
    releaseAlerts: vi.fn(async () => {}),
    adminEmail: ADMIN,
    installLink: "https://app.example.test/install",
    send: vi.fn(async () => ({ delivered: true })),
    ...over,
  };
}

const lostAgency = (over: Partial<SyncDeps> = {}) =>
  missingDeps({
    agency: async () => null,
    claimAgencyAlert: vi.fn(async () => true),
    releaseAgencyAlert: vi.fn(async () => {}),
    ...over,
  });

// The real guard, with a fetch that must never be reached.
function guardedSend(env: Record<string, string | undefined>) {
  const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
  const sender = createEmailSenderFromEnv(
    { RESEND_API_KEY: "test-key", EMAIL_FROM: "crm@example.test", ...env },
    { fetch: fetchSpy as unknown as typeof fetch },
  );
  return { send: (message: EmailMessage) => sender.send(message), fetchSpy };
}

const BLOCKED_CONFIGS: Array<[string, Record<string, string | undefined>]> = [
  ["mode unset", {}],
  ["mode log", { EMAIL_DELIVERY_MODE: "log" }],
  ["unknown mode", { EMAIL_DELIVERY_MODE: "LIVE " + "now" }],
  ["allowlist without the admin", { EMAIL_DELIVERY_MODE: "allowlist", EMAIL_ALLOWED_RECIPIENTS: "someone-else@example.test" }],
];

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  prisma.rateLimit.deleteMany.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("missing-app alert that was not delivered", () => {
  it("delivered: counts it and keeps the claim", async () => {
    const deps = missingDeps();
    const summary = await runSync(deps);
    expect(summary.alertsSent).toBe(1);
    expect(deps.releaseAlerts).not.toHaveBeenCalled();
  });

  it.each(BLOCKED_CONFIGS)("%s: releases the claim and counts nothing", async (_name, env) => {
    const { send, fetchSpy } = guardedSend(env);
    const deps = missingDeps({ send });
    const summary = await runSync(deps);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(summary.alertsSent).toBe(0);
    expect(deps.releaseAlerts).toHaveBeenCalledWith(["loc_a"]);
  });

  it("logs a fixed reason with no address or id", async () => {
    const deps = missingDeps({ send: vi.fn(async () => ({ delivered: false })) });
    await runSync(deps);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("missing_app_alert_not_delivered");
    for (const value of [ADMIN, "loc_a", "co_a"]) expect(logged).not.toContain(value);
  });

  it("a blocked alert for one company leaves another company's claim alone", async () => {
    const deps = missingDeps({
      companyIds: async () => ["co_a", "co_b"],
      send: vi.fn(async (message: EmailMessage) => ({ delivered: !message.text.includes("loc_a") })),
    });
    const summary = await runSync(deps);
    expect(summary.alertsSent).toBe(1);
    expect(deps.releaseAlerts).toHaveBeenCalledTimes(1);
    expect(deps.releaseAlerts).toHaveBeenCalledWith(["loc_a"]);
  });

  it("a failed release is counted and does not stop the run", async () => {
    const deps = missingDeps({
      send: vi.fn(async () => ({ delivered: false })),
      releaseAlerts: vi.fn(async () => { throw new Error("db down"); }),
    });
    await expect(runSync(deps)).resolves.toMatchObject({ alertsSent: 0, failures: 1 });
  });
});

describe("lost-agency alert that was not delivered", () => {
  it("delivered: counts it and keeps the claim", async () => {
    const deps = lostAgency();
    const summary = await runSync(deps);
    expect(summary.alertsSent).toBe(1);
    expect(deps.releaseAgencyAlert).not.toHaveBeenCalled();
  });

  it.each(BLOCKED_CONFIGS)("%s: releases the claim and counts nothing", async (_name, env) => {
    const { send, fetchSpy } = guardedSend(env);
    const deps = lostAgency({ send });
    const summary = await runSync(deps);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(summary.alertsSent).toBe(0);
    expect(deps.releaseAgencyAlert).toHaveBeenCalledWith("co_a");
  });

  it("logs a fixed reason with no address or id", async () => {
    const deps = lostAgency({ send: vi.fn(async () => ({ delivered: false })) });
    await runSync(deps);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("agency_alert_not_delivered");
    for (const value of [ADMIN, "co_a"]) expect(logged).not.toContain(value);
  });

  it("a blocked alert for one company leaves another company's claim alone", async () => {
    const deps = lostAgency({
      companyIds: async () => ["co_a", "co_b"],
      send: vi.fn(async (message: EmailMessage) => ({ delivered: !message.text.includes("co_a") })),
    });
    const summary = await runSync(deps);
    expect(summary.alertsSent).toBe(1);
    expect(deps.releaseAgencyAlert).toHaveBeenCalledTimes(1);
    expect(deps.releaseAgencyAlert).toHaveBeenCalledWith("co_a");
  });

  it("a failed release is counted and does not stop the run", async () => {
    const deps = lostAgency({
      send: vi.fn(async () => ({ delivered: false })),
      releaseAgencyAlert: vi.fn(async () => { throw new Error("db down"); }),
    });
    await expect(runSync(deps)).resolves.toMatchObject({ alertsSent: 0, failures: 1 });
  });
});

describe("clearRateLimit", () => {
  it("removes only the counter of that exact app key", async () => {
    await clearRateLimit("agency-token-alert:co_a");
    expect(prisma.rateLimit.deleteMany).toHaveBeenCalledWith({ where: { key: "app:agency-token-alert:co_a" } });
  });
});
