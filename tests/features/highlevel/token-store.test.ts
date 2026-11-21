import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aadFor, decrypt, encrypt } from "@/shared/lib/encryption";

const key = randomBytes(32).toString("base64");
const T0 = new Date("2026-11-21T10:00:00.000Z");
const T1 = new Date("2026-11-22T10:00:00.000Z");

let log: string[];
let locationRow: Record<string, unknown> | null;
let agencyRow: Record<string, unknown> | null;
let lockRows: unknown[];
let txOptions: unknown;
let lockQuery: { text: string; values: unknown[] } | null;
let written: { model: string; args: Record<string, unknown> }[];

function locationRowFor(tenantId: string, refresh: string | null = "old-loc-refresh") {
  return {
    tenantId,
    locationId: "loc_1",
    accessTokenEnc: encrypt("old-loc-access", key, aadFor("HlLocationConnection", tenantId, "accessTokenEnc")),
    refreshTokenEnc:
      refresh === null ? null : encrypt(refresh, key, aadFor("HlLocationConnection", tenantId, "refreshTokenEnc")),
    expiresAt: T0,
    tenant: { status: "connected", companyId: "company_1" },
  };
}
function agencyRowFor(companyId: string) {
  return {
    companyId,
    accessTokenEnc: encrypt("old-agency-access", key, aadFor("HlAgencyConnection", companyId, "accessTokenEnc")),
    refreshTokenEnc: encrypt("old-agency-refresh", key, aadFor("HlAgencyConnection", companyId, "refreshTokenEnc")),
    expiresAt: T0,
  };
}

// Like the real client, return only the fields `select` asks for (nested selects too). A fake that
// returns the whole row would hide a select that forgot a column the code depends on.
function pick(row: Record<string, unknown> | null, select: unknown): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [name, wanted] of Object.entries(select as Record<string, unknown>)) {
    if (wanted === true) out[name] = row[name];
    else if (typeof wanted === "object" && wanted !== null && "select" in wanted) {
      out[name] = pick(row[name] as Record<string, unknown>, (wanted as { select: unknown }).select);
    }
  }
  return out;
}

const fake = {
  hlLocationConnection: {
    findUnique: vi.fn(async (args: { select: unknown }) => {
      log.push("read-location");
      return pick(locationRow, args.select);
    }),
    update: vi.fn(async (args: Record<string, unknown>) => {
      log.push("write-location");
      written.push({ model: "hlLocationConnection", args });
      return {};
    }),
  },
  hlAgencyConnection: {
    findUnique: vi.fn(async (args: { select: unknown }) => {
      log.push("read-agency");
      return pick(agencyRow, args.select);
    }),
    update: vi.fn(async (args: Record<string, unknown>) => {
      log.push("write-agency");
      written.push({ model: "hlAgencyConnection", args });
      return {};
    }),
  },
  tenant: {
    update: vi.fn(async (args: Record<string, unknown>) => {
      log.push("write-tenant");
      written.push({ model: "tenant", args });
      return {};
    }),
  },
  $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    log.push("lock");
    lockQuery = { text: strings.join("?"), values };
    return lockRows;
  }),
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => {
    log.push("begin");
    txOptions = options;
    const result = await fn(fake);
    log.push("commit");
    return result;
  }),
};
// The outer client (what getPrisma() returns) can only start a transaction and read. The lock and every
// write exist only on `fake`, which is what a transaction callback receives. So a lock or a write taken
// outside the transaction throws "not a function" instead of passing silently.
const outer = {
  $transaction: (...args: Parameters<typeof fake.$transaction>) => fake.$transaction(...args),
  hlLocationConnection: {
    findUnique: async (args: { select: unknown }) => {
      log.push("outer-read-location");
      return pick(locationRow, args.select);
    },
  },
  hlAgencyConnection: {
    findUnique: async (args: { select: unknown }) => {
      log.push("outer-read-agency");
      return pick(agencyRow, args.select);
    },
  },
};
vi.mock("@/shared/lib/prisma", () => ({ getPrisma: () => outer }));

import {
  readAgencyState,
  readLocationState,
  updateAgencyLocked,
  updateLocationLocked,
} from "@/features/highlevel";

beforeEach(() => {
  vi.clearAllMocks();
  log = [];
  written = [];
  lockQuery = null;
  txOptions = undefined;
  lockRows = [{ id: "row_1" }];
  locationRow = locationRowFor("tenant_1");
  agencyRow = agencyRowFor("company_1");
});

describe("token store: reads", () => {
  it("decrypts a location connection with the tenant and column bound", async () => {
    const state = await readLocationState("tenant_1", key);
    expect(state).toEqual({
      tenantId: "tenant_1",
      locationId: "loc_1",
      companyId: "company_1",
      status: "connected",
      accessToken: "old-loc-access",
      refreshToken: "old-loc-refresh",
      expiresAt: T0,
    });
  });

  it.each(["uninstalled", "needs_reconnect"] as const)("reports a %s tenant as such, and a missing companyId as null", async (status) => {
    locationRow = { ...locationRowFor("tenant_1"), tenant: { status, companyId: null } };
    const state = await readLocationState("tenant_1", key);
    expect(state?.status).toBe(status);
    expect(state?.companyId).toBeNull();
  });

  it("returns null when there is no connection, and a null refresh token as null", async () => {
    locationRow = null;
    expect(await readLocationState("tenant_1", key)).toBeNull();
    locationRow = locationRowFor("tenant_1", null);
    expect((await readLocationState("tenant_1", key))?.refreshToken).toBeNull();
  });

  it("refuses a row whose ciphertext belongs to another tenant (aad binding)", async () => {
    locationRow = { ...locationRowFor("tenant_OTHER"), tenantId: "tenant_1" };
    await expect(readLocationState("tenant_1", key)).rejects.toThrow();
  });

  it("decrypts an agency connection, null when absent", async () => {
    expect(await readAgencyState("company_1", key)).toEqual({
      companyId: "company_1",
      accessToken: "old-agency-access",
      refreshToken: "old-agency-refresh",
      expiresAt: T0,
    });
    agencyRow = null;
    expect(await readAgencyState("company_1", key)).toBeNull();
  });
});

describe("token store: updateLocationLocked", () => {
  it("locks the row inside the transaction, re-reads after the lock, then decides and commits", async () => {
    const decide = vi.fn(async () => ({ kind: "keep" as const }));
    await updateLocationLocked("tenant_1", key, decide);
    expect(log).toEqual(["begin", "lock", "read-location", "commit"]);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(written).toEqual([]);
  });

  it("locks with FOR UPDATE on the location connection, tenant id as a bound parameter", async () => {
    await updateLocationLocked("tenant_1", key, async () => ({ kind: "keep" }));
    expect(lockQuery?.text).toMatch(/SELECT .* FROM "HlLocationConnection" WHERE "tenantId" = \? FOR UPDATE/s);
    expect(lockQuery?.values).toEqual(["tenant_1"]);
  });

  it("allows the transaction to outlive the default 5 s (it spans a HighLevel call)", async () => {
    await updateLocationLocked("tenant_1", key, async () => ({ kind: "keep" }));
    const { timeout, maxWait } = txOptions as { timeout: number; maxWait: number };
    expect(timeout).toBeGreaterThanOrEqual(20_000);
    expect(maxWait).toBeGreaterThanOrEqual(5_000);
  });

  it("gives decide the state as it is after the lock (a concurrent refresher's write is visible)", async () => {
    const decide = vi.fn<(state: unknown) => Promise<{ kind: "keep" }>>(async () => ({ kind: "keep" }));
    await updateLocationLocked("tenant_1", key, decide);
    expect(decide.mock.calls[0]?.[0]).toMatchObject({ accessToken: "old-loc-access", expiresAt: T0 });
  });

  it("returns null and never calls decide when the connection is gone (uninstalled meanwhile)", async () => {
    lockRows = [];
    const decide = vi.fn(async () => ({ kind: "keep" as const }));
    expect(await updateLocationLocked("tenant_1", key, decide)).toBeNull();
    expect(decide).not.toHaveBeenCalled();
    expect(log).toEqual(["begin", "lock", "commit"]);
  });

  it("saves new tokens encrypted and bound to tenant and column, and returns the new state", async () => {
    const next = await updateLocationLocked("tenant_1", key, async () => ({
      kind: "save",
      accessToken: "new-loc-access",
      refreshToken: "new-loc-refresh",
      expiresAt: T1,
    }));
    const write = written.find((w) => w.model === "hlLocationConnection");
    const data = write?.args.data as Record<string, unknown>;
    expect(write?.args.where).toEqual({ tenantId: "tenant_1" });
    expect(data.expiresAt).toEqual(T1);
    expect(JSON.stringify(data)).not.toContain("new-loc-access");
    expect(decrypt(data.accessTokenEnc as string, key, aadFor("HlLocationConnection", "tenant_1", "accessTokenEnc"))).toBe("new-loc-access");
    expect(decrypt(data.refreshTokenEnc as string, key, aadFor("HlLocationConnection", "tenant_1", "refreshTokenEnc"))).toBe("new-loc-refresh");
    expect(next).toMatchObject({ accessToken: "new-loc-access", refreshToken: "new-loc-refresh", expiresAt: T1, status: "connected" });
    expect(log).toEqual(["begin", "lock", "read-location", "write-location", "commit"]);
  });

  it("keeps the stored refresh token when the decision carries none", async () => {
    const next = await updateLocationLocked("tenant_1", key, async () => ({
      kind: "save",
      accessToken: "new-loc-access",
      expiresAt: T1,
    }));
    const data = written[0]?.args.data as Record<string, unknown>;
    expect("refreshTokenEnc" in data).toBe(false);
    expect(next?.refreshToken).toBe("old-loc-refresh");
  });

  it("clears the stored refresh token when the decision says null", async () => {
    const next = await updateLocationLocked("tenant_1", key, async () => ({
      kind: "save",
      accessToken: "new-loc-access",
      refreshToken: null,
      expiresAt: T1,
    }));
    expect((written[0]?.args.data as Record<string, unknown>).refreshTokenEnc).toBeNull();
    expect(next?.refreshToken).toBeNull();
  });

  it("marks the tenant needs_reconnect on a reconnect decision and writes no token", async () => {
    const next = await updateLocationLocked("tenant_1", key, async () => ({ kind: "reconnect" }));
    expect(written).toEqual([{ model: "tenant", args: { where: { id: "tenant_1" }, data: { status: "needs_reconnect" } } }]);
    expect(next?.status).toBe("needs_reconnect");
  });

  it("writes nothing when decide throws, and passes the error on", async () => {
    await expect(
      updateLocationLocked("tenant_1", key, async () => {
        throw new Error("highlevel down");
      }),
    ).rejects.toThrow("highlevel down");
    expect(written).toEqual([]);
    expect(log).not.toContain("commit");
  });
});

describe("token store: updateAgencyLocked", () => {
  it("locks FOR UPDATE on the agency connection, re-reads, and keeps without writing", async () => {
    const decide = vi.fn(async () => ({ kind: "keep" as const }));
    await updateAgencyLocked("company_1", key, decide);
    expect(lockQuery?.text).toMatch(/FROM "HlAgencyConnection" WHERE "companyId" = \? FOR UPDATE/s);
    expect(lockQuery?.values).toEqual(["company_1"]);
    expect(log).toEqual(["begin", "lock", "read-agency", "commit"]);
    expect(written).toEqual([]);
  });

  it("saves both tokens encrypted and bound to the company; the rotated refresh token is stored", async () => {
    const next = await updateAgencyLocked("company_1", key, async () => ({
      kind: "save",
      accessToken: "new-agency-access",
      refreshToken: "new-agency-refresh",
      expiresAt: T1,
    }));
    const data = written[0]?.args.data as Record<string, unknown>;
    expect(written[0]?.args.where).toEqual({ companyId: "company_1" });
    expect(decrypt(data.accessTokenEnc as string, key, aadFor("HlAgencyConnection", "company_1", "accessTokenEnc"))).toBe("new-agency-access");
    expect(decrypt(data.refreshTokenEnc as string, key, aadFor("HlAgencyConnection", "company_1", "refreshTokenEnc"))).toBe("new-agency-refresh");
    expect(next).toMatchObject({ accessToken: "new-agency-access", refreshToken: "new-agency-refresh", expiresAt: T1 });
  });

  it("returns null when there is no agency connection", async () => {
    lockRows = [];
    const decide = vi.fn(async () => ({ kind: "keep" as const }));
    expect(await updateAgencyLocked("company_1", key, decide)).toBeNull();
    expect(decide).not.toHaveBeenCalled();
  });
});
