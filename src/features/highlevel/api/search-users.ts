import { HighLevelHttpError } from "./client";
import type { HighLevelUser, SearchUsersQuery } from "../types";

// One call with the tenant's token and, on a 401 only, one refresh-and-retry. A second 401 and any
// other error propagate. The tenant id comes from the server, never from request input.
export async function searchUsersWithRetry(
  deps: {
    getLocationToken: (tenantId: string, options?: { rejectedToken?: string }) => Promise<string>;
    searchUsers: (accessToken: string, query: SearchUsersQuery) => Promise<HighLevelUser[]>;
  },
  tenantId: string,
  query: SearchUsersQuery,
): Promise<HighLevelUser[]> {
  const token = await deps.getLocationToken(tenantId);
  try {
    return await deps.searchUsers(token, query);
  } catch (error) {
    if (!(error instanceof HighLevelHttpError) || error.status !== 401) throw error;
    return deps.searchUsers(await deps.getLocationToken(tenantId, { rejectedToken: token }), query);
  }
}
