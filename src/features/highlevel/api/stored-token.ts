import { parseEnv } from "@/shared/config";
import { readLocationState } from "../db/token-store";
import { TokenServiceError } from "./token-service";

// For an admin's read-only client view: runs `call` with the token already stored. It never refreshes
// or mints a token, takes no lock, changes no status and does not retry, so looking at a client
// cannot affect that client's connection. Without a connected, unexpired token it throws
// `unavailable`. A 401 is handed back to the caller as it is.
export async function withStoredLocationToken(
  tenantId: string,
  call: (accessToken: string) => Promise<Response>,
): Promise<Response> {
  const env = parseEnv("highlevel");
  let state;
  try {
    state = await readLocationState(tenantId, env.TOKEN_ENCRYPTION_KEY);
  } catch {
    throw new TokenServiceError("unavailable");
  }
  if (!state || state.status !== "connected" || state.expiresAt.getTime() <= Date.now()) {
    throw new TokenServiceError("unavailable");
  }
  return call(state.accessToken);
}
