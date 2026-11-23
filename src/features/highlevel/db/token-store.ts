import { getPrisma } from "@/shared/lib/prisma";
import { aadFor, decrypt, encrypt } from "@/shared/lib/encryption";
import type {
  AgencyState,
  AgencyDecision,
  LocationDecision,
  LocationState,
} from "../types";

// Reads and locked updates of stored tokens for the token service. Together with connections.ts this
// is the only code that touches token columns; every token uses aadFor(table, ownerId, column).

// The lock transaction spans one HighLevel call (10 s timeout per request), so the default 5 s
// interactive transaction timeout is too short.
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

type LocationRow = {
  tenantId: string;
  locationId: string;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  expiresAt: Date;
  tenant: { status: LocationState["status"]; companyId: string | null };
};

type AgencyRow = {
  companyId: string;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  expiresAt: Date;
};

const locationSelect = {
  tenantId: true,
  locationId: true,
  accessTokenEnc: true,
  refreshTokenEnc: true,
  expiresAt: true,
  tenant: { select: { status: true, companyId: true } },
} as const;

const agencySelect = {
  companyId: true,
  accessTokenEnc: true,
  refreshTokenEnc: true,
  expiresAt: true,
} as const;

function toLocationState(row: LocationRow, key: string): LocationState {
  const aad = (column: string) => aadFor("HlLocationConnection", row.tenantId, column);
  return {
    tenantId: row.tenantId,
    locationId: row.locationId,
    companyId: row.tenant.companyId,
    status: row.tenant.status,
    accessToken: decrypt(row.accessTokenEnc, key, aad("accessTokenEnc")),
    refreshToken:
      row.refreshTokenEnc === null ? null : decrypt(row.refreshTokenEnc, key, aad("refreshTokenEnc")),
    expiresAt: row.expiresAt,
  };
}

function toAgencyState(row: AgencyRow, key: string): AgencyState {
  const aad = (column: string) => aadFor("HlAgencyConnection", row.companyId, column);
  return {
    companyId: row.companyId,
    accessToken: decrypt(row.accessTokenEnc, key, aad("accessTokenEnc")),
    refreshToken: decrypt(row.refreshTokenEnc, key, aad("refreshTokenEnc")),
    expiresAt: row.expiresAt,
  };
}

export async function readLocationState(tenantId: string, key: string): Promise<LocationState | null> {
  const row = await getPrisma().hlLocationConnection.findUnique({ where: { tenantId }, select: locationSelect });
  return row ? toLocationState(row, key) : null;
}

export async function readAgencyState(companyId: string, key: string): Promise<AgencyState | null> {
  const row = await getPrisma().hlAgencyConnection.findUnique({ where: { companyId }, select: agencySelect });
  return row ? toAgencyState(row, key) : null;
}

// Ids only, soonest expiry first: what the background renewal has to look at.
export async function listDueAgencyIds(before: Date, limit: number): Promise<string[]> {
  const rows = await getPrisma().hlAgencyConnection.findMany({
    where: { expiresAt: { lt: before } },
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: { companyId: true },
  });
  return rows.map((row) => row.companyId);
}

export async function listDueLocationTenantIds(before: Date, limit: number): Promise<string[]> {
  const rows = await getPrisma().hlLocationConnection.findMany({
    where: { expiresAt: { lt: before }, tenant: { status: "connected" } },
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: { tenantId: true },
  });
  return rows.map((row) => row.tenantId);
}

// Row lock, then re-read, then decide, then write, all in one transaction: two callers that both
// found the token stale take turns, and the second one sees the first one's new token and keeps it.
// Refresh tokens rotate (the old one dies), so a second refresh with the old one would break the
// connection. Null when the connection no longer exists.
export async function updateLocationLocked(
  tenantId: string,
  key: string,
  decide: (state: LocationState) => Promise<LocationDecision>,
): Promise<LocationState | null> {
  return getPrisma().$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "HlLocationConnection" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await tx.hlLocationConnection.findUnique({ where: { tenantId }, select: locationSelect });
    if (!row) return null;
    const state = toLocationState(row, key);
    const decision = await decide(state);
    if (decision.kind === "keep") return state;
    if (decision.kind === "reconnect") {
      await tx.tenant.update({ where: { id: tenantId }, data: { status: "needs_reconnect" } });
      return { ...state, status: "needs_reconnect" };
    }
    const aad = (column: string) => aadFor("HlLocationConnection", tenantId, column);
    await tx.hlLocationConnection.update({
      where: { tenantId },
      data: {
        accessTokenEnc: encrypt(decision.accessToken, key, aad("accessTokenEnc")),
        ...(decision.refreshToken === undefined
          ? {}
          : {
              refreshTokenEnc:
                decision.refreshToken === null
                  ? null
                  : encrypt(decision.refreshToken, key, aad("refreshTokenEnc")),
            }),
        expiresAt: decision.expiresAt,
      },
    });
    return {
      ...state,
      accessToken: decision.accessToken,
      refreshToken: decision.refreshToken === undefined ? state.refreshToken : decision.refreshToken,
      expiresAt: decision.expiresAt,
    };
  }, TX_OPTIONS);
}

export async function updateAgencyLocked(
  companyId: string,
  key: string,
  decide: (state: AgencyState) => Promise<AgencyDecision>,
): Promise<AgencyState | null> {
  return getPrisma().$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "HlAgencyConnection" WHERE "companyId" = ${companyId} FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await tx.hlAgencyConnection.findUnique({ where: { companyId }, select: agencySelect });
    if (!row) return null;
    const state = toAgencyState(row, key);
    const decision = await decide(state);
    if (decision.kind === "keep") return state;
    const aad = (column: string) => aadFor("HlAgencyConnection", companyId, column);
    await tx.hlAgencyConnection.update({
      where: { companyId },
      data: {
        accessTokenEnc: encrypt(decision.accessToken, key, aad("accessTokenEnc")),
        refreshTokenEnc: encrypt(decision.refreshToken, key, aad("refreshTokenEnc")),
        expiresAt: decision.expiresAt,
      },
    });
    return {
      companyId,
      accessToken: decision.accessToken,
      refreshToken: decision.refreshToken,
      expiresAt: decision.expiresAt,
    };
  }, TX_OPTIONS);
}
