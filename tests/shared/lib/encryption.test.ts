import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/shared/lib/encryption";

const key = randomBytes(32).toString("base64");
const otherKey = randomBytes(32).toString("base64");

describe("encryption (AES-256-GCM)", () => {
  it("decrypts what it encrypted", () => {
    expect(decrypt(encrypt("access-token-123", key), key)).toBe("access-token-123");
  });

  it("round-trips unicode and long text", () => {
    const text = "tökén ✓ ".repeat(500);
    expect(decrypt(encrypt(text, key), key)).toBe(text);
  });

  it("does not contain the plaintext in the stored string", () => {
    expect(encrypt("access-token-123", key)).not.toContain("access-token-123");
  });

  it("gives a different output each time for the same input", () => {
    expect(encrypt("same", key)).not.toBe(encrypt("same", key));
  });

  it("fails to decrypt with another key", () => {
    expect(() => decrypt(encrypt("secret", key), otherKey)).toThrow();
  });

  it("fails when the stored string was tampered with", () => {
    const stored = encrypt("secret", key);
    const parts = stored.split(":");
    const flipped = Buffer.from(parts[3], "base64");
    flipped[0] ^= 0xff;
    parts[3] = flipped.toString("base64");
    expect(() => decrypt(parts.join(":"), key)).toThrow();
  });

  it("fails on a stored string with the wrong shape", () => {
    expect(() => decrypt("not-a-payload", key)).toThrow();
    expect(() => decrypt("v9:a:b:c", key)).toThrow();
  });

  it("rejects a key that is not 32 bytes, without echoing the key", () => {
    const short = Buffer.from("too-short").toString("base64");
    let message = "";
    try {
      encrypt("x", short);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/32 bytes/);
    expect(message).not.toContain(short);
  });
});
