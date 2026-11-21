import { HighLevelHttpError } from "./client";
import type { CustomValue } from "../types";

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
