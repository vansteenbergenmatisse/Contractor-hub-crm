import CryptoJS from "crypto-js";
import type { EmbedErrorCode, UserContext } from "../types";

// HighLevel's documented decrypt: CryptoJS.AES.decrypt(encryptedUserData, sharedSecretKey) then
// JSON.parse (docs/greenlane/hl-api-notes.md). The docs do not state the byte format; a string secret
// means CryptoJS passphrase mode. Unproven against a real payload until one is captured on staging.
const MAX_PAYLOAD_LENGTH = 8192; // a real payload is a few hundred characters
const MAX_FIELD_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const MESSAGES: Record<EmbedErrorCode, string> = {
  invalid_payload: "The user data could not be read.",
  no_location: "The user data has no sub-account.",
};

// The message is fixed per code: never the payload, the secret or a decrypted value.
export class EmbedError extends Error {
  readonly code: EmbedErrorCode;
  constructor(code: EmbedErrorCode) {
    super(MESSAGES[code]);
    this.name = "EmbedError";
    this.code = code;
  }
}

const isText = (value: unknown, max = MAX_FIELD_LENGTH): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;

export function decryptUserContext(payload: string, secret: string): UserContext {
  if (typeof payload !== "string" || payload.length === 0 || payload.length > MAX_PAYLOAD_LENGTH || secret.length === 0) {
    throw new EmbedError("invalid_payload");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(CryptoJS.AES.decrypt(payload, secret).toString(CryptoJS.enc.Utf8));
  } catch {
    throw new EmbedError("invalid_payload");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new EmbedError("invalid_payload");
  const data = parsed as Record<string, unknown>;

  const email = isText(data.email) ? data.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email)) throw new EmbedError("invalid_payload");
  // A sub-account context is detected by activeLocation being present, not by `type` (the docs'
  // sample shows type "agency" next to an activeLocation).
  if (!isText(data.activeLocation)) throw new EmbedError("no_location");

  const result: UserContext = { email, activeLocation: data.activeLocation.trim() };
  for (const key of ["userId", "companyId", "role", "type"] as const) {
    if (isText(data[key])) result[key] = (data[key] as string).trim();
  }
  return result;
}
