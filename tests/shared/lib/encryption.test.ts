import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/shared/lib/encryption";

const key = randomBytes(32).toString("base64");
const otherKey = randomBytes(32).toString("base64");
// Binds a ciphertext to its row and column, so it cannot be moved to another tenant or field.
const aad = "HlLocationConnection:tenant_1:accessTokenEnc";

// Produced once with raw node:crypto (not with this module): key 32 x 0x01, IV 12 x 0x02,
// the aad above, plaintext "known-answer-token". Fails if format, order or algorithm drift.
const knownKey = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
const knownPayload = "v1:AgICAgICAgICAgIC:E8JkDEVB//gXvkt7xEaHkg==:bLimPiR6oJOgu9m6cdOt2cfb";

function mutate(change: (parts: string[]) => void): string {
  const parts = encrypt("secret", key, aad).split(":");
  change(parts);
  return parts.join(":");
}

function flipFirstByte(part: string): string {
  const bytes = Buffer.from(part, "base64");
  bytes[0] ^= 0xff;
  return bytes.toString("base64");
}

describe("encryption (AES-256-GCM)", () => {
  it("decrypts what it encrypted", () => {
    expect(decrypt(encrypt("access-token-123", key, aad), key, aad)).toBe("access-token-123");
  });

  it("round-trips unicode, long text and the empty string", () => {
    const text = "tökén ✓ ".repeat(500);
    expect(decrypt(encrypt(text, key, aad), key, aad)).toBe(text);
    expect(decrypt(encrypt("", key, aad), key, aad)).toBe("");
  });

  it("decrypts a known-answer payload made outside this module", () => {
    expect(decrypt(knownPayload, knownKey, aad)).toBe("known-answer-token");
  });

  it("stores the v1 format: version, 12-byte IV, 16-byte tag, ciphertext", () => {
    expect(encrypt("x", key, aad)).toMatch(
      /^v1:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:[A-Za-z0-9+/]+={0,2}$/,
    );
  });

  it("does not contain the plaintext in the stored string", () => {
    expect(encrypt("access-token-123", key, aad)).not.toContain("access-token-123");
  });

  it("uses a fresh IV every time", () => {
    const ivs = new Set(
      Array.from({ length: 1000 }, () => encrypt("same", key, aad).split(":")[1]),
    );
    expect(ivs.size).toBe(1000);
  });

  it("fails to decrypt with another key", () => {
    expect(() => decrypt(encrypt("secret", key, aad), otherKey, aad)).toThrow(/authenticate/);
  });

  it("fails when the context differs: another tenant, or another column", () => {
    const stored = encrypt("secret", key, aad);
    expect(() =>
      decrypt(stored, key, "HlLocationConnection:tenant_2:accessTokenEnc"),
    ).toThrow(/authenticate/);
    expect(() =>
      decrypt(stored, key, "HlLocationConnection:tenant_1:refreshTokenEnc"),
    ).toThrow(/authenticate/);
  });

  it.each([
    ["iv", 1],
    ["tag", 2],
    ["ciphertext", 3],
  ])("fails when the %s was tampered with", (_name, index) => {
    const stored = mutate((parts) => {
      parts[index] = flipFirstByte(parts[index]);
    });
    expect(() => decrypt(stored, key, aad)).toThrow(/authenticate/);
  });

  it("fails when the ciphertext was truncated", () => {
    const stored = mutate((parts) => {
      parts[3] = Buffer.from(parts[3], "base64").subarray(0, -1).toString("base64");
    });
    expect(() => decrypt(stored, key, aad)).toThrow(/authenticate/);
  });

  it.each([
    ["truncated tag", (p: string[]) => void (p[2] = Buffer.alloc(4).toString("base64"))],
    ["short iv", (p: string[]) => void (p[1] = Buffer.alloc(8).toString("base64"))],
    ["swapped iv and tag", (p: string[]) => void ([p[1], p[2]] = [p[2], p[1]])],
    ["extra part", (p: string[]) => void p.push("x")],
    ["missing part", (p: string[]) => void p.pop()],
    ["unknown version", (p: string[]) => void (p[0] = "v2")],
    ["non-base64 characters", (p: string[]) => void (p[3] = `${p[3]}!!`)],
  ])("rejects a stored string with a %s", (_name, change) => {
    expect(() => decrypt(mutate(change), key, aad)).toThrow(/unknown format/);
  });

  it("rejects text that is not a stored string at all", () => {
    expect(() => decrypt("not-a-payload", key, aad)).toThrow(/unknown format/);
  });

  it.each([
    ["too short", Buffer.from("too-short").toString("base64")],
    ["33 bytes", randomBytes(33).toString("base64")],
    ["empty", ""],
    ["trailing newline", `${key}\n`],
    ["base64url alphabet", Buffer.alloc(32, 0xfb).toString("base64url")],
    ["stray characters", `!!${key}`],
  ])("rejects a key that is %s, without echoing it", (_name, badKey) => {
    let message = "";
    try {
      encrypt("x", badKey, aad);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/32 bytes/);
    if (badKey) expect(message).not.toContain(badKey);
  });

  it("never puts the key or the plaintext in a decrypt error", () => {
    let message = "";
    try {
      decrypt(encrypt("plain-secret-value", key, aad), otherKey, aad);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain("plain-secret-value");
    expect(message).not.toContain(otherKey);
  });
});
