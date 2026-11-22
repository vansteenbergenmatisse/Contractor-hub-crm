import { HighLevelHttpError } from "./client";
import type { HighLevelUser } from "../types";

// The users of one sub-account with the tenant's token; on a 401 only, one refresh-and-retry.
export async function listLocationUsersWithRetry(
  deps: {
    getLocationToken: (tenantId: string, options?: { rejectedToken?: string }) => Promise<string>;
    listLocationUsers: (accessToken: string, companyId: string | null, locationId: string) => Promise<HighLevelUser[]>;
  },
  tenantId: string,
  companyId: string | null,
  locationId: string,
): Promise<HighLevelUser[]> {
  const token = await deps.getLocationToken(tenantId);
  try {
    return await deps.listLocationUsers(token, companyId, locationId);
  } catch (error) {
    if (!(error instanceof HighLevelHttpError) || error.status !== 401) throw error;
    return deps.listLocationUsers(await deps.getLocationToken(tenantId, { rejectedToken: token }), companyId, locationId);
  }
}
