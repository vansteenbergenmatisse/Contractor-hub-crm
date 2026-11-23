import { parseEnv } from "@/shared/config";
import { readLocationState } from "../db/token-store";
import { createPipelineReaderFrom, createPipelineRequests, type PipelineRateLimit, type PipelineServices } from "./pipeline-read";
import { getTokenService } from "./routes";
import { withStoredLocationToken } from "./stored-token";

// Env is read per request, so `next build` needs none. The token service is built only when the
// refreshing path is really used, so an admin's client view never constructs it.
function buildServices(): PipelineServices {
  const env = parseEnv("highlevel");
  const requests = createPipelineRequests({ baseUrl: env.GHL_API_BASE_URL });
  return {
    ...requests,
    readLocationId: async (tenantId) => (await readLocationState(tenantId, env.TOKEN_ENCRYPTION_KEY))?.locationId ?? null,
    withLocationToken: (tenantId, call) => getTokenService().withLocationToken(tenantId, call),
    withStoredLocationToken,
  };
}

// The board read behind a limit. The limiter is injected because auth, which owns hitRateLimit,
// already imports this feature. Pass `viewer` for an admin's read-only client view.
export function createTenantPipelineReader(hit: PipelineRateLimit, viewer?: { viewerId: string }) {
  return createPipelineReaderFrom(buildServices, hit, viewer);
}
