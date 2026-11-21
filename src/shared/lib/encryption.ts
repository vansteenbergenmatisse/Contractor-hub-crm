import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for tokens stored at rest. The key is the base64 of 32 random bytes
// (`openssl rand -base64 32`), one per environment. Stored format: "v1:<iv>:<tag>:<ciphertext>",
// each part base64. The version prefix lets a later key or algorithm change be detected.
const VERSION = "v1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function toKeyBuffer(key: string): Buffer {
  const buffer = Buffer.from(key, "base64");
  if (buffer.length !== KEY_BYTES) {
    throw new Error(`Encryption key must be ${KEY_BYTES} bytes, base64 encoded.`);
  }
  return buffer;
}

export function encrypt(plaintext: string, key: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", toKeyBuffer(key), iv, { authTagLength: TAG_BYTES });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((part) => (typeof part === "string" ? part : part.toString("base64"))).join(":");
}

export function decrypt(payload: string, key: string): string {
  const [version, ivPart, tagPart, ciphertextPart, ...extra] = payload.split(":");
  if (version !== VERSION || !ivPart || !tagPart || ciphertextPart === undefined || extra.length > 0) {
    throw new Error("Encrypted value has an unknown format.");
  }
  const iv = Buffer.from(ivPart, "base64");
  const tag = Buffer.from(tagPart, "base64");
  // Node accepts shortened GCM tags unless the length is checked, which weakens authentication.
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("Encrypted value has an unknown format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", toKeyBuffer(key), iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
