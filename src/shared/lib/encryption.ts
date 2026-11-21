import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for tokens stored at rest. The key is the base64 of 32 random bytes
// (`openssl rand -base64 32`), one per environment. Stored format: "v1:<iv>:<tag>:<ciphertext>",
// each part base64. The version prefix lets a later key or algorithm change be detected.
//
// `aad` binds a ciphertext to its place, for example "HlLocationConnection:<tenantId>:accessTokenEnc".
// A value copied to another tenant's row or another column then fails to decrypt. The caller must
// pass the same aad to decrypt. Not secret, but never empty in real use.
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/; // standard base64 of exactly 32 bytes
const BASE64_PATTERN = /^[A-Za-z0-9+/]*={0,2}$/;
const BAD_FORMAT = "Encrypted value has an unknown format.";

function toKeyBuffer(key: string): Buffer {
  if (!KEY_PATTERN.test(key) || Buffer.from(key, "base64").length !== KEY_BYTES) {
    throw new Error(`Encryption key must be ${KEY_BYTES} bytes, standard base64 encoded.`);
  }
  return Buffer.from(key, "base64");
}

export function encrypt(plaintext: string, key: string, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", toKeyBuffer(key), iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(
    ":",
  );
}

export function decrypt(payload: string, key: string, aad: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION || !parts.slice(1).every((p) => BASE64_PATTERN.test(p))) {
    throw new Error(BAD_FORMAT);
  }
  const [, ivPart, tagPart, ciphertextPart] = parts;
  const iv = Buffer.from(ivPart, "base64");
  const tag = Buffer.from(tagPart, "base64");
  // Node accepts shortened GCM tags unless the length is checked, which weakens authentication.
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error(BAD_FORMAT);
  }
  const decipher = createDecipheriv("aes-256-gcm", toKeyBuffer(key), iv, {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
