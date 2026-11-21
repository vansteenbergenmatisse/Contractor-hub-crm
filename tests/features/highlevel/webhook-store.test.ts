import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aadFor, encrypt } from "@/shared/lib/encryption";

type Call = { op: string; args: Record<string, unknown> };
const calls: Call[] = [];
let tenantForLocation: { id: string } | null = null;
let createError: unknown = null;
let existingEvent: { processedAt: Date | null } | null = null;
let agencyRow: { accessTokenEnc: string; expiresAt: Date } | null = null;

const record = (op: string, args: Record<string, unknown>) => calls.push({ op, args });
const fake = {
  tenant: {
    findUnique: vi.fn(async (args: Record<string, unknown>) => (record("tenant.findUnique", args), tenantForLocation)),
    updateMany: vi.fn(async (args: Record<string, unknown>) => (record("tenant.updateMany", args), { count: 1 })),
  },
  webhookEvent: {
    create: vi.fn(async (args: Record<string, unknown>) => {
      record("webhookEvent.create", args);
      if (createError) throw createError;
      return {};
    }),
    findUnique: vi.fn(async (args: Record<string, unknown>) => (record("webhookEvent.findUnique", args), existingEvent)),
    update: vi.fn(async (args: Record<string, unknown>) => (record("webhookEvent.update", args), {})),
  },
  hlLocationConnection: {
    deleteMany: vi.fn(async (args: Record<string, unknown>) => (record("hlLocationConnection.deleteMany", args), { count: 1 })),
  },
  hlAgencyConnection: {
    findUnique: vi.fn(async (args: Record<string, unknown>) => (record("hlAgencyConnection.findUnique", args), agencyRow)),
    deleteMany: vi.fn(async (args: Record<string, unknown>) => (record("hlAgencyConnection.deleteMany", args), { count: 1 })),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fake)),
};
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => fake }));

import {
  beginWebhookEvent,
  deleteAgencyConnection,
  markLocationUninstalled,
  markWebhookProcessed,
  readAgencyAccessToken,
} from "@/features/highlevel";

const key = randomBytes(32).toString("base64");
const NOW = new Date("2026-11-21T10:00:00.000Z");
const event = {
  webhookId: "wh_1",
  type: "UNINSTALL",
  locationId: "loc_1" as string | null,
  companyId: null as string | null,
  payload: { type: "UNINSTALL", appId: "app-1", locationId: "loc_1" },
};

beforeEach(() => {
  calls.length = 0;
  tenantForLocation = null;
  createError = null;
  existingEvent = null;
  agencyRow = null;
  vi.clearAllMocks();
});

const ops = () => calls.map((c) => c.op);
const arg = (op: string): Record<string, unknown> => (calls.find((c) => c.op === op) as Call).args;

describe("beginWebhookEvent", () => {
  it("stores a new event with the tenant resolved from the locationId on the server", async () => {
    tenantForLocation = { id: "tenant_1" };
    expect(await beginWebhookEvent(event)).toBe("process");
    expect(arg("tenant.findUnique").where).toEqual({ locationId: "loc_1" });
    expect(arg("webhookEvent.create").data).toEqual({
      webhookId: "wh_1",
      type: "UNINSTALL",
      tenantId: "tenant_1",
      locationId: "loc_1",
      companyId: null,
      payload: event.payload,
    });
  });

  it("stores a null tenant for an unknown location and skips the lookup for an agency event", async () => {
    expect(await beginWebhookEvent(event)).toBe("process");
    expect((arg("webhookEvent.create").data as { tenantId: unknown }).tenantId).toBeNull();
    calls.length = 0;
    await beginWebhookEvent({ ...event, locationId: null, companyId: "company_1" });
    expect(ops()).not.toContain("tenant.findUnique");
  });

  it("reports a repeat of a processed event as a duplicate", async () => {
    createError = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    existingEvent = { processedAt: NOW };
    expect(await beginWebhookEvent(event)).toBe("duplicate");
    expect(arg("webhookEvent.findUnique")).toEqual({ where: { webhookId: "wh_1" }, select: { processedAt: true } });
    expect(ops().indexOf("webhookEvent.create")).toBeLessThan(ops().indexOf("webhookEvent.findUnique"));
  });

  it("lets an event that was stored but never processed run again", async () => {
    createError = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    existingEvent = { processedAt: null };
    expect(await beginWebhookEvent(event)).toBe("process");
  });

  it("rethrows any other database error", async () => {
    createError = Object.assign(new Error("connection lost"), { code: "P1001" });
    await expect(beginWebhookEvent(event)).rejects.toThrow("connection lost");
  });
});

describe("markWebhookProcessed", () => {
  it("sets processedAt on that webhookId", async () => {
    await markWebhookProcessed("wh_1", NOW);
    expect(arg("webhookEvent.update")).toEqual({ where: { webhookId: "wh_1" }, data: { processedAt: NOW } });
  });
});

describe("markLocationUninstalled", () => {
  it("deletes the location's tokens and marks only that tenant uninstalled, in one transaction", async () => {
    await markLocationUninstalled("loc_1", NOW);
    expect(fake.$transaction).toHaveBeenCalledTimes(1);
    expect(arg("hlLocationConnection.deleteMany")).toEqual({ where: { locationId: "loc_1" } });
    expect(arg("tenant.updateMany")).toEqual({
      where: { locationId: "loc_1" },
      data: { status: "uninstalled", uninstalledAt: NOW },
    });
  });
});

describe("deleteAgencyConnection", () => {
  it("deletes the agency token of that company only", async () => {
    await deleteAgencyConnection("company_1");
    expect(arg("hlAgencyConnection.deleteMany")).toEqual({ where: { companyId: "company_1" } });
  });
});

describe("readAgencyAccessToken", () => {
  const stored = (expiresAt: Date, companyId = "company_1") => ({
    accessTokenEnc: encrypt("agency-access", key, aadFor("HlAgencyConnection", companyId, "accessTokenEnc")),
    expiresAt,
  });

  it("returns the decrypted token while it has more than a minute left", async () => {
    agencyRow = stored(new Date(NOW.getTime() + 5 * 60 * 1000));
    expect(await readAgencyAccessToken("company_1", key, NOW)).toBe("agency-access");
    expect(arg("hlAgencyConnection.findUnique").where).toEqual({ companyId: "company_1" });
  });

  it("returns null when there is none, when it is expired or about to expire", async () => {
    expect(await readAgencyAccessToken("company_1", key, NOW)).toBeNull();
    agencyRow = stored(new Date(NOW.getTime() + 30 * 1000));
    expect(await readAgencyAccessToken("company_1", key, NOW)).toBeNull();
    agencyRow = stored(new Date(NOW.getTime() - 1000));
    expect(await readAgencyAccessToken("company_1", key, NOW)).toBeNull();
  });

  it("does not decrypt a token that was stored for another company", async () => {
    agencyRow = stored(new Date(NOW.getTime() + 5 * 60 * 1000), "company_other");
    await expect(readAgencyAccessToken("company_1", key, NOW)).rejects.toThrow();
  });
});
