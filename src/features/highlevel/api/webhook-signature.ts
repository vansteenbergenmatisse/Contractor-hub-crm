import { createPublicKey, verify } from "node:crypto";

// HighLevel's published Ed25519 public key (SPKI). Public, not a secret. Source: the Webhook
// Integration Guide, checked 2026-11-21 (see docs/greenlane/hl-api-notes.md). Re-read the guide if
// every webhook starts failing verification: a key change makes everything fail closed.
export const HIGHLEVEL_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

const SIGNATURE_BYTES = 64; // Ed25519
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

// The docs do not say whether the raw bytes or the re-serialized JSON are signed (their example
// verifies JSON.stringify(req.body)), so both are tried. Never throws: any problem is "not verified".
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  publicKeyPem: string = HIGHLEVEL_WEBHOOK_PUBLIC_KEY,
): boolean {
  if (!rawBody || !signature || !BASE64_PATTERN.test(signature)) return false;
  const signatureBytes = Buffer.from(signature, "base64");
  if (signatureBytes.length !== SIGNATURE_BYTES) return false;
  try {
    const key = createPublicKey(publicKeyPem);
    const candidates = [rawBody];
    try {
      const reserialized = JSON.stringify(JSON.parse(rawBody));
      if (reserialized !== rawBody) candidates.push(reserialized);
    } catch {
      // not JSON: only the raw bytes can be verified
    }
    return candidates.some((message) => verify(null, Buffer.from(message), key, signatureBytes));
  } catch {
    return false;
  }
}
