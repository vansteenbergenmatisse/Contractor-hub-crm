import { HighLevelHttpError, isRejectedByHighLevel } from "./client";
import type {
  AgencyDecision,
  AgencyState,
  LocationDecision,
  LocationState,
  LocationToken,
  RefreshedToken,
} from "../types";

// Keeps HighLevel tokens usable. Rules (build prompt section 4.8):
// - refresh or re-mint when less than 5 minutes are left (exactly 5 is still fresh);
// - one refresh at a time per token, via the row lock in db/token-store.ts (refresh tokens rotate:
//   the old one dies, so a second refresh with it would break the connection);
// - a call that gets a 401 is retried once after a refresh;
// - a connection HighLevel no longer honors is marked needs_reconnect.

const MIN_LIFE_MS = 5 * 60 * 1000;

// Never hold a row lock while waiting for another connection: the pool is small, and tenants that all
// wait for an agency refresh while holding a connection each would block each other. So a location
// that needs a re-mint aborts its lock with this signal, the agency token is fetched with no lock
// held, and the location is locked again.
class RemintNeeded extends Error {
  constructor(readonly companyId: string) {
    super("re-mint needed");
  }
}
// HighLevel refused the agency token itself (401 or 403 on the mint): the tenant did nothing wrong.
class AgencyTokenRefused extends Error {}

const isAuthRefusal = (error: unknown) =>
  error instanceof HighLevelHttpError && (error.status === 401 || error.status === 403);

export type TokenServiceErrorCode =
  | "not_connected" // no connection, or the location was uninstalled
  | "needs_reconnect" // the tenant must be installed again
  | "agency_unavailable" // the agency token cannot be refreshed: the agency must reinstall
  | "unavailable"; // HighLevel or the network failed; try again later, nothing was changed

const MESSAGES: Record<TokenServiceErrorCode, string> = {
  not_connected: "No HighLevel connection for this tenant.",
  needs_reconnect: "The HighLevel connection needs to be reconnected.",
  agency_unavailable: "The HighLevel agency token cannot be refreshed.",
  unavailable: "HighLevel is not reachable right now.",
};

// The message is fixed per code: never a token, an id, or upstream text.
export class TokenServiceError extends Error {
  readonly code: TokenServiceErrorCode;
  constructor(code: TokenServiceErrorCode) {
    super(MESSAGES[code]);
    this.name = "TokenServiceError";
    this.code = code;
  }
}

export type TokenServiceDeps = {
  client: {
    refreshToken(refreshToken: string, userType: "Company" | "Location"): Promise<RefreshedToken>;
    mintLocationToken(agencyAccessToken: string, companyId: string, locationId: string): Promise<LocationToken>;
  };
  store: {
    readLocationState(tenantId: string): Promise<LocationState | null>;
    readAgencyState(companyId: string): Promise<AgencyState | null>;
    updateLocationLocked(
      tenantId: string,
      decide: (state: LocationState) => Promise<LocationDecision>,
    ): Promise<LocationState | null>;
    updateAgencyLocked(
      companyId: string,
      decide: (state: AgencyState) => Promise<AgencyDecision>,
    ): Promise<AgencyState | null>;
  };
  now: () => Date;
};

export function createTokenService(deps: TokenServiceDeps) {
  const { client, store } = deps;
  const expiryFrom = (now: Date, expiresInSeconds: number) => new Date(now.getTime() + expiresInSeconds * 1000);
  // `rejected`: a token a caller just got a 401 for; it counts as stale whatever its expiry says.
  const isStale = (token: { accessToken: string; expiresAt: Date }, now: Date, rejected?: string) =>
    token.accessToken === rejected || token.expiresAt.getTime() - now.getTime() < MIN_LIFE_MS;

  function refusal(state: LocationState): TokenServiceError | null {
    if (state.status === "uninstalled") return new TokenServiceError("not_connected");
    if (state.status === "needs_reconnect") return new TokenServiceError("needs_reconnect");
    return null;
  }

  // The store can fail after HighLevel already rotated a refresh token (the new one is then lost).
  // For a location that heals itself: the next call finds the old refresh token rejected and re-mints
  // from the agency token. For the agency token it does not: the agency must reinstall. Either way
  // the caller gets a fixed-message error, never a database message.
  function hideStoreFailure(error: unknown): never {
    if (error instanceof TokenServiceError) throw error;
    console.error("HighLevel token store failed:", error instanceof Error ? error.name : "unknown error");
    throw new TokenServiceError("unavailable");
  }

  // Agency access token, refreshed when needed. Null when this agency has no connection at all.
  async function getAgencyToken(companyId: string, options: { rejectedToken?: string } = {}): Promise<string | null> {
    const { rejectedToken } = options;
    const current = await store.readAgencyState(companyId).catch(hideStoreFailure);
    if (!current) return null;
    if (!isStale(current, deps.now(), rejectedToken)) return current.accessToken;

    const updated = await store
      .updateAgencyLocked(companyId, async (locked): Promise<AgencyDecision> => {
        const now = deps.now();
        if (!isStale(locked, now, rejectedToken)) return { kind: "keep" }; // a concurrent caller refreshed it
        let next: RefreshedToken;
        try {
          next = await client.refreshToken(locked.refreshToken, "Company");
        } catch (error) {
          // Rejected or not, nothing is stored: a wrong client secret looks the same as a revoked token.
          throw new TokenServiceError(isRejectedByHighLevel(error) ? "agency_unavailable" : "unavailable");
        }
        return {
          kind: "save",
          accessToken: next.accessToken,
          refreshToken: next.refreshToken ?? locked.refreshToken,
          expiresAt: expiryFrom(now, next.expiresInSeconds),
        };
      })
      .catch(hideStoreFailure);
    return updated ? updated.accessToken : null;
  }

  // Like getAgencyToken, but null also when the agency token cannot be refreshed (the agency has to
  // reinstall). A temporary failure still throws, so a webhook answers 500 and HighLevel retries.
  async function findAgencyToken(companyId: string): Promise<string | null> {
    try {
      return await getAgencyToken(companyId);
    } catch (error) {
      if (error instanceof TokenServiceError && error.code === "agency_unavailable") return null;
      throw error;
    }
  }

  // Phase 2 of a location refresh: mint a new location token with an agency token, no lock held while
  // the agency token is obtained. A 401 or 403 from the mint means the agency token is bad: renew it
  // once and try again; if it is still refused nothing is changed (an agency problem must not flip
  // tenants). Only another 4xx (the location is not installed any more) ends the connection.
  async function remint(
    tenantId: string,
    companyId: string,
    rejectedLocationToken: string | undefined,
  ): Promise<LocationState | null> {
    let refusedAgencyToken: string | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const agencyToken = await getAgencyToken(companyId, { rejectedToken: refusedAgencyToken });
      try {
        return await store.updateLocationLocked(tenantId, async (locked): Promise<LocationDecision> => {
          if (locked.status !== "connected") return { kind: "keep" };
          const now = deps.now();
          if (!isStale(locked, now, rejectedLocationToken)) return { kind: "keep" };
          if (agencyToken === null) return { kind: "reconnect" }; // no agency connection at all
          try {
            const minted = await client.mintLocationToken(agencyToken, companyId, locked.locationId);
            return {
              kind: "save",
              accessToken: minted.accessToken,
              refreshToken: minted.refreshToken,
              expiresAt: expiryFrom(now, minted.expiresInSeconds),
            };
          } catch (error) {
            if (isAuthRefusal(error)) throw new AgencyTokenRefused();
            if (isRejectedByHighLevel(error)) return { kind: "reconnect" };
            throw new TokenServiceError("unavailable");
          }
        });
      } catch (error) {
        if (!(error instanceof AgencyTokenRefused) || agencyToken === null) throw error;
        refusedAgencyToken = agencyToken;
      }
    }
    throw new TokenServiceError("agency_unavailable");
  }

  // `rejectedToken`: the token a call just got a 401 for. It is replaced even if its expiry looks fine,
  // but only if it is still the stored one (otherwise someone else already replaced it).
  async function getLocationToken(tenantId: string, options: { rejectedToken?: string } = {}): Promise<string> {
    const { rejectedToken } = options;
    const current = await store.readLocationState(tenantId).catch(hideStoreFailure);
    if (!current) throw new TokenServiceError("not_connected");
    const refused = refusal(current);
    if (refused) throw refused;
    if (!isStale(current, deps.now(), rejectedToken)) return current.accessToken;

    let updated: LocationState | null;
    try {
      // Phase 1, under the row lock: refresh with the stored refresh token.
      updated = await store.updateLocationLocked(tenantId, async (locked): Promise<LocationDecision> => {
        if (locked.status !== "connected") return { kind: "keep" };
        const now = deps.now();
        if (!isStale(locked, now, rejectedToken)) return { kind: "keep" };
        if (locked.refreshToken !== null) {
          try {
            const next = await client.refreshToken(locked.refreshToken, "Location");
            return {
              kind: "save",
              accessToken: next.accessToken,
              refreshToken: next.refreshToken ?? undefined,
              expiresAt: expiryFrom(now, next.expiresInSeconds),
            };
          } catch (error) {
            // A 4xx means HighLevel refuses this refresh token: re-mint. Anything else is "later".
            if (!isRejectedByHighLevel(error)) throw new TokenServiceError("unavailable");
          }
        }
        if (locked.companyId === null) return { kind: "reconnect" }; // nothing to re-mint with
        throw new RemintNeeded(locked.companyId);
      });
    } catch (error) {
      if (!(error instanceof RemintNeeded)) hideStoreFailure(error);
      try {
        updated = await remint(tenantId, (error as RemintNeeded).companyId, rejectedToken);
      } catch (remintError) {
        hideStoreFailure(remintError);
      }
    }

    if (!updated) throw new TokenServiceError("not_connected");
    const refusedNow = refusal(updated);
    if (refusedNow) throw refusedNow;
    return updated.accessToken;
  }

  // Runs `call` with the tenant's token. A 401 means the token is dead whatever its expiry says:
  // refresh once and call once more. The second answer is returned as it is. The tenant id must come
  // from the server session, never from request input: this does no authorization.
  async function withLocationToken(
    tenantId: string,
    call: (accessToken: string) => Promise<Response>,
  ): Promise<Response> {
    const token = await getLocationToken(tenantId);
    const first = await call(token);
    if (first.status !== 401) return first;
    await first.body?.cancel().catch(() => {});
    const renewed = await getLocationToken(tenantId, { rejectedToken: token });
    return call(renewed);
  }

  return { getLocationToken, getAgencyToken, findAgencyToken, withLocationToken };
}
