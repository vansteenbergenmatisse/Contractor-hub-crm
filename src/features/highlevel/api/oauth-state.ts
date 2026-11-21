import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// The OAuth `state` is "<nonce>.<expiresAtMs>.<signature>". The signature is an HMAC the server
// makes with a subkey derived from `secret` (TOKEN_ENCRYPTION_KEY, separated by a fixed label so the
// key is not used for two jobs directly). Only /start can mint a state that verifies, so a forged
// cookie plus a matching query value is rejected. The same value also sits in a cookie that only
// the browser that started the install sends back.
//
// Limits (recorded in PROGRESS.md): the server keeps no list of used states, so single use rests on
// HighLevel's single-use code and the cleared cookie; there is no rate limit here.
//
// Cookie: `__Secure-` prefix (browsers refuse to set it over plain http; it does NOT stop a sibling
// subdomain on the same site from setting it, only `__Host-` does, which needs Path=/), path-scoped,
// Lax so it survives the redirect back from HighLevel (a top-level GET navigation).
export const STATE_COOKIE = "__Secure-gl_oauth_state";
export const STATE_COOKIE_PATH = "/api/integrations/oauth";
export const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_MAX_AGE_SECONDS = STATE_TTL_MS / 1000;
const STATE_PATTERN = /^([A-Za-z0-9_-]{22})\.(\d{1,16})\.([A-Za-z0-9_-]{43})$/;

function sign(secret: string, payload: string): string {
  const subkey = createHmac("sha256", secret).update("gl-oauth-state-v1").digest();
  return createHmac("sha256", subkey).update(payload).digest("base64url");
}

export function newState(secret: string, now: Date): string {
  const payload = `${randomBytes(16).toString("base64url")}.${now.getTime() + STATE_TTL_MS}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function isValidState(state: string, secret: string, now: Date): boolean {
  const match = STATE_PATTERN.exec(state);
  if (!match) return false;
  const [, nonce, expires, signature] = match;
  const expected = Buffer.from(sign(secret, `${nonce}.${expires}`));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return Number(expires) > now.getTime();
}

export function stateCookie(state: string): string {
  return `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=${STATE_COOKIE_PATH}; Max-Age=${STATE_MAX_AGE_SECONDS}`;
}

export function clearStateCookie(): string {
  return `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=${STATE_COOKIE_PATH}; Max-Age=0`;
}
