import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature, HIGHLEVEL_WEBHOOK_PUBLIC_KEY } from "@/features/highlevel";

// A throwaway key pair: the real private key is HighLevel's, so tests sign with their own.
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const testKeyPem = publicKey.export({ type: "spki", format: "pem" }) as string;
const sig = (message: string | Buffer) => sign(null, Buffer.from(message), privateKey).toString("base64");

const raw = '{"type":"UNINSTALL","appId":"app-1","locationId":"loc_1"}';

describe("webhook signature (Ed25519)", () => {
  it("accepts a signature over the raw body", () => {
    expect(verifyWebhookSignature(raw, sig(raw), testKeyPem)).toBe(true);
  });

  it("accepts a signature over the re-serialized JSON when the raw bytes differ in spacing", () => {
    const spaced = '{ "type": "UNINSTALL", "appId": "app-1", "locationId": "loc_1" }';
    expect(verifyWebhookSignature(spaced, sig(JSON.stringify(JSON.parse(spaced))), testKeyPem)).toBe(true);
  });

  it("rejects a body changed after signing", () => {
    expect(verifyWebhookSignature(raw.replace("loc_1", "loc_2"), sig(raw), testKeyPem)).toBe(false);
  });

  it("rejects a signature made with another key", () => {
    const other = generateKeyPairSync("ed25519");
    const forged = sign(null, Buffer.from(raw), other.privateKey).toString("base64");
    expect(verifyWebhookSignature(raw, forged, testKeyPem)).toBe(false);
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["not base64", "%%%not base64%%%"],
    ["too short", "AAAA"],
    ["too long", Buffer.alloc(200, 1).toString("base64")],
    ["hex instead of base64 of the right length", Buffer.alloc(64, 1).toString("hex")],
  ])("rejects a %s signature without throwing", (_label, signature) => {
    expect(verifyWebhookSignature(raw, signature, testKeyPem)).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(verifyWebhookSignature("", sig(""), testKeyPem)).toBe(false);
  });

  it("verifies raw bytes without requiring JSON (the handler parses after verifying)", () => {
    expect(verifyWebhookSignature("not json", sig("not json"), testKeyPem)).toBe(true);
  });

  it("ships HighLevel's published public key, which parses as Ed25519", () => {
    expect(HIGHLEVEL_WEBHOOK_PUBLIC_KEY).toContain("MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=");
    // A syntactically valid but unrelated signature must be rejected without throwing.
    expect(verifyWebhookSignature(raw, Buffer.alloc(64, 3).toString("base64"))).toBe(false);
  });
});
