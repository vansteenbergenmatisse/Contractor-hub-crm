import CryptoJS from "crypto-js";
import { describe, expect, it } from "vitest";
import { decryptUserContext, EmbedError } from "@/features/embed";

const SECRET = "test-shared-secret";
const json = {
  userId: "u_1",
  email: "Pat@Example.test",
  activeLocation: "loc_1",
  companyId: "co_1",
  role: "admin",
  type: "agency",
  future: "x",
};
const encrypt = (value: unknown, secret = SECRET) => CryptoJS.AES.encrypt(typeof value === "string" ? value : JSON.stringify(value), secret).toString();

// Made with a different tool, so the format is not only checked against the code that reads it:
//   printf '%s' '<json above>' | openssl enc -aes-256-cbc -md md5 -salt -a -A -pass pass:test-shared-secret
// This is the format CryptoJS.AES.encrypt(string, passphrase) produces ("Salted__" + salt, MD5 key derivation).
const OPENSSL_VECTOR =
  "U2FsdGVkX1/e2bBFIDRgB8oNt9LyLyIlfWkB3hY89dvD/h1gvBv0/raezAwiozRgSSeklj63w2WQ/BP6yOJXaaUwQLVnWQqwADSFKBgcqgShkvg0g3lFWykvxF2Amw1f2VNMtCCio9mL23mpRM6Gdx2invuR9AqnGEsBn6UZxvbRSASgIfg8KmJBJpiwImioUcAtxaVn0R0wlTSUJcZVnQ==";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof EmbedError ? error.code : "other";
  }
  return "none";
};

describe("decryptUserContext", () => {
  it("decrypts a payload made by OpenSSL in the CryptoJS passphrase format", () => {
    expect(decryptUserContext(OPENSSL_VECTOR, SECRET)).toEqual({
      userId: "u_1",
      email: "pat@example.test",
      activeLocation: "loc_1",
      companyId: "co_1",
      role: "admin",
      type: "agency",
    });
  });

  it("round-trips a payload made by crypto-js", () => {
    expect(decryptUserContext(encrypt(json), SECRET).activeLocation).toBe("loc_1");
  });

  it("lower-cases and trims the email, ignores unknown keys, keeps only the known fields", () => {
    const result = decryptUserContext(encrypt({ ...json, email: "  PAT@Example.TEST " }), SECRET);
    expect(result.email).toBe("pat@example.test");
    expect(result).not.toHaveProperty("future");
  });

  it("works without the optional fields", () => {
    expect(decryptUserContext(encrypt({ email: "a@b.test", activeLocation: "l" }), SECRET)).toEqual({
      email: "a@b.test",
      activeLocation: "l",
    });
  });

  it("refuses a wrong secret", () => {
    expect(code(() => decryptUserContext(OPENSSL_VECTOR, "other-secret"))).toBe("invalid_payload");
  });

  it.each(["", "not base64 !!!", "U2FsdGVkX1", "{}", "null", "[]"])("refuses garbage %j", (payload) => {
    expect(code(() => decryptUserContext(payload, SECRET))).toBe("invalid_payload");
  });

  it("refuses a truncated payload", () => {
    expect(code(() => decryptUserContext(OPENSSL_VECTOR.slice(0, 60), SECRET))).toBe("invalid_payload");
  });

  it("refuses text that decrypts but is not a JSON object", () => {
    for (const value of ['"just a string"', "[1,2]", "12", "not json"]) {
      expect(code(() => decryptUserContext(encrypt(value), SECRET))).toBe("invalid_payload");
    }
  });

  it("refuses a missing or wrong-typed email", () => {
    for (const email of [undefined, "", 5, null, "no-at-sign", "a@b", "a b@c.test"]) {
      expect(code(() => decryptUserContext(encrypt({ ...json, email }), SECRET))).toBe("invalid_payload");
    }
  });

  it("says there is no sub-account when activeLocation is missing, empty or not a string (agency level)", () => {
    for (const activeLocation of [undefined, "", 7, null]) {
      expect(code(() => decryptUserContext(encrypt({ ...json, activeLocation }), SECRET))).toBe("no_location");
    }
  });

  it("does not depend on type: an agency-typed payload with an activeLocation is accepted", () => {
    expect(decryptUserContext(encrypt({ ...json, type: "agency" }), SECRET).activeLocation).toBe("loc_1");
  });

  it("refuses an oversized payload and an empty secret without trying to decrypt", () => {
    expect(code(() => decryptUserContext("A".repeat(20_000), SECRET))).toBe("invalid_payload");
    expect(code(() => decryptUserContext(OPENSSL_VECTOR, ""))).toBe("invalid_payload");
    expect(code(() => decryptUserContext(123 as unknown as string, SECRET))).toBe("invalid_payload");
  });

  it("never puts the payload or the secret in the error message", () => {
    try {
      decryptUserContext("secret-looking-payload", SECRET);
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("secret-looking-payload");
      expect(String((error as Error).message)).not.toContain(SECRET);
    }
  });
});
