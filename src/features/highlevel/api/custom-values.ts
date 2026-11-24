import { HighLevelHttpError } from "./client";
import type { CustomValue, LocationState } from "../types";

// The custom values of one tenant's sub-account, with one refresh-and-retry on a 401 (same rule as
// searchUsersWithRetry). The tenant id comes from the server, never from request input.
export async function listCustomValuesWithRetry(
  deps: {
    getLocationToken: (tenantId: string, options?: { rejectedToken?: string }) => Promise<string>;
    readLocationId: (tenantId: string) => Promise<string | null>;
    listCustomValues: (accessToken: string, locationId: string) => Promise<CustomValue[]>;
  },
  tenantId: string,
): Promise<CustomValue[]> {
  const locationId = await deps.readLocationId(tenantId);
  if (!locationId) return [];
  const token = await deps.getLocationToken(tenantId);
  try {
    return await deps.listCustomValues(token, locationId);
  } catch (error) {
    if (!(error instanceof HighLevelHttpError) || error.status !== 401) throw error;
    return deps.listCustomValues(await deps.getLocationToken(tenantId, { rejectedToken: token }), locationId);
  }
}

// For anonymous pages. Reads with the token already stored and nothing else: no refresh, no mint, no
// lock, no status change, no retry. Null when there is no connected, unexpired token or HighLevel
// answers 401; the caller shows cached or neutral content.
export async function readCustomValuesWithStoredToken(
  deps: {
    readState: (tenantId: string) => Promise<Pick<LocationState, "status" | "accessToken" | "locationId" | "expiresAt"> | null>;
    listCustomValues: (accessToken: string, locationId: string) => Promise<CustomValue[]>;
    now: () => Date;
  },
  tenantId: string,
): Promise<CustomValue[] | null> {
  // Log lines name the reason or step only: never a value, a token or a body.
  const state = await deps.readState(tenantId);
  const skipped = !state ? "no-connection" : state.status !== "connected" ? "not-connected" : state.expiresAt.getTime() <= deps.now().getTime() ? "expired" : null;
  if (skipped || !state) {
    console.error(`HighLevel custom values read (stored token) skipped: reason=${skipped}`);
    return null;
  }
  try {
    return await deps.listCustomValues(state.accessToken, state.locationId);
  } catch (error) {
    const step = error instanceof HighLevelHttpError ? `request status=${error.status ?? "none"}` : "parse";
    console.error(`HighLevel custom values read (stored token) failed: step=${step}`);
    if (error instanceof HighLevelHttpError && error.status === 401) return null;
    throw error;
  }
}
