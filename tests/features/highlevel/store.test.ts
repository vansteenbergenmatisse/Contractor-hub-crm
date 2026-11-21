import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aadFor, decrypt } from "@/shared/lib/encryption";

// Fake Prisma: records calls. Only the shape the store is allowed to use.
type Call = { model: string; method: string; args: Record<string, unknown> };
const calls: Call[] = [];
let tenantId = "tenant_1";
let existingTenant: { companyId: string | null } | null = null;
const fake = {
  tenant: {
    findUnique: vi.fn(async (args: Record<string, unknown>) => {
      calls.push({ model: "tenant", method: "findUnique", args });
      return existingTenant;
    }),
    upsert: vi.fn(async (args: Record<string, unknown>) => {
      calls.push({ model: "tenant", method: "upsert", args });
      return { id: tenantId };
    }),
  },
  hlLocationConnection: {
    upsert: vi.fn(async (args: Record<string, unknown>) => {
      calls.push({ model: "hlLocationConnection", method: "upsert", args });
      return {};
    }),
  },
  hlAgencyConnection: {
    upsert: vi.fn(async (args: Record<string, unknown>) => {
      calls.push({ model: "hlAgencyConnection", method: "upsert", args });
      return {};
    }),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fake)),
};
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => fake }));

import { saveAgencyConnection, saveLocationConnection } from "@/features/highlevel";

const key = randomBytes(32).toString("base64");
const expiresAt = new Date("2026-11-22T10:00:00.000Z");

beforeEach(() => {
  calls.length = 0;
  tenantId = "tenant_1";
  existingTenant = null;
  vi.clearAllMocks();
});

function callFor(model: string, method = "upsert"): Call {
  const call = calls.find((c) => c.model === model && c.method === method);
  if (!call) throw new Error(`no ${model} call`);
  return call;
}

describe("store: saveAgencyConnection", () => {
  it("upserts by companyId with both tokens encrypted and bound to the company and column", async () => {
    await saveAgencyConnection(
      { companyId: "company_1", accessToken: "agency-access", refreshToken: "agency-refresh", expiresAt },
      key,
    );
    const { where, create, update } = callFor("hlAgencyConnection").args as {
      where: unknown;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(where).toEqual({ companyId: "company_1" });
    for (const data of [create, update]) {
      expect(data.expiresAt).toEqual(expiresAt);
      expect(decrypt(data.accessTokenEnc as string, key, aadFor("HlAgencyConnection", "company_1", "accessTokenEnc"))).toBe("agency-access");
      expect(decrypt(data.refreshTokenEnc as string, key, aadFor("HlAgencyConnection", "company_1", "refreshTokenEnc"))).toBe("agency-refresh");
    }
    expect(JSON.stringify(calls)).not.toContain("agency-access");
    expect(JSON.stringify(calls)).not.toContain("agency-refresh");
  });
});

describe("store: saveLocationConnection", () => {
  const input = {
    locationId: "loc_1",
    companyId: "company_1",
    name: "Name loc_1",
    accessToken: "loc-access",
    refreshToken: "loc-refresh" as string | null,
    expiresAt,
  };

  it("upserts the tenant by locationId as connected, then the connection with encrypted tokens", async () => {
    const result = await saveLocationConnection(input, key);

    expect(result).toEqual({ tenantId: "tenant_1" });
    expect(fake.$transaction).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => `${c.model}.${c.method}`)).toEqual([
      "tenant.findUnique",
      "tenant.upsert",
      "hlLocationConnection.upsert",
    ]);

    const tenant = callFor("tenant").args as {
      where: unknown;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(tenant.where).toEqual({ locationId: "loc_1" });
    expect(tenant.create).toMatchObject({ locationId: "loc_1", companyId: "company_1", name: "Name loc_1", status: "connected" });
    // A re-install brings an uninstalled or broken tenant back.
    expect(tenant.update).toMatchObject({ companyId: "company_1", name: "Name loc_1", status: "connected", uninstalledAt: null });

    const connection = callFor("hlLocationConnection").args as {
      where: unknown;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(connection.where).toEqual({ tenantId: "tenant_1" });
    for (const data of [connection.create, connection.update]) {
      expect(data.expiresAt).toEqual(expiresAt);
      expect(decrypt(data.accessTokenEnc as string, key, aadFor("HlLocationConnection", "tenant_1", "accessTokenEnc"))).toBe("loc-access");
      expect(decrypt(data.refreshTokenEnc as string, key, aadFor("HlLocationConnection", "tenant_1", "refreshTokenEnc"))).toBe("loc-refresh");
    }
    expect(connection.create).toMatchObject({ tenantId: "tenant_1", locationId: "loc_1" });
  });

  it("binds ciphertext to the tenant: it does not decrypt for another tenant", async () => {
    await saveLocationConnection(input, key);
    const { create } = callFor("hlLocationConnection").args as { create: Record<string, unknown> };
    expect(() =>
      decrypt(create.accessTokenEnc as string, key, aadFor("HlLocationConnection", "tenant_2", "accessTokenEnc")),
    ).toThrow();
    expect(() =>
      decrypt(create.accessTokenEnc as string, key, aadFor("HlLocationConnection", "tenant_1", "refreshTokenEnc")),
    ).toThrow();
  });

  it("stores a null refresh token as null and clears an old one on update", async () => {
    await saveLocationConnection({ ...input, refreshToken: null }, key);
    const { create, update } = callFor("hlLocationConnection").args as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(create.refreshTokenEnc).toBeNull();
    expect(update.refreshTokenEnc).toBeNull();
  });

  it("does not overwrite an existing tenant name when HighLevel gave none", async () => {
    await saveLocationConnection({ ...input, name: null }, key);
    const { create, update } = callFor("tenant").args as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(create.name).toBeNull();
    expect("name" in update).toBe(false);
  });

  it("never passes a plaintext token to Prisma", async () => {
    await saveLocationConnection(input, key);
    const serialized = JSON.stringify(calls);
    expect(serialized).not.toContain("loc-access");
    expect(serialized).not.toContain("loc-refresh");
  });

  it("refuses a location that already belongs to another agency and writes nothing", async () => {
    existingTenant = { companyId: "company_other" };
    await expect(saveLocationConnection(input, key)).rejects.toThrow(
      "Location already belongs to a different agency.",
    );
    expect(calls.filter((c) => c.method === "upsert")).toEqual([]);
  });

  it("accepts a re-install by the same agency, and a tenant with no agency yet", async () => {
    existingTenant = { companyId: "company_1" };
    await expect(saveLocationConnection(input, key)).resolves.toEqual({ tenantId: "tenant_1" });
    existingTenant = { companyId: null };
    await expect(saveLocationConnection(input, key)).resolves.toEqual({ tenantId: "tenant_1" });
  });
});
