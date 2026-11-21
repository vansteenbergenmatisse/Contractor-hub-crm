import { describe, expect, it } from "vitest";
import { parseEnv } from "@/shared/config";

const auth = {
  APP_URL: "https://app.example.test",
  BETTER_AUTH_URL: "https://app.example.test",
  BETTER_AUTH_SECRET: "auth-secret-value",
};

describe("parseEnv", () => {
  it("returns the values of a group when every name is set", () => {
    expect(parseEnv("auth", auth)).toEqual(auth);
  });

  it("returns only the names of the requested group", () => {
    const result = parseEnv("database", { DATABASE_URL: "db-value", ...auth });
    expect(result).toEqual({ DATABASE_URL: "db-value" });
  });

  it("throws an error that lists every missing name", () => {
    expect(() => parseEnv("auth", { APP_URL: "https://app.example.test" })).toThrow(
      /BETTER_AUTH_URL, BETTER_AUTH_SECRET/,
    );
  });

  it("names the group in the error", () => {
    expect(() => parseEnv("highlevel", {})).toThrow(/"highlevel"/);
  });

  it("treats empty and blank values as missing", () => {
    expect(() =>
      parseEnv("auth", { APP_URL: "", BETTER_AUTH_URL: "   ", BETTER_AUTH_SECRET: "x" }),
    ).toThrow(/APP_URL, BETTER_AUTH_URL/);
  });

  it("never puts a value in the error message", () => {
    let message = "";
    try {
      parseEnv("auth", { BETTER_AUTH_SECRET: "super-secret-do-not-leak" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("APP_URL");
    expect(message).not.toContain("super-secret-do-not-leak");
  });

  it("rejects a secret that carries the NEXT_PUBLIC_ prefix, without echoing its value", () => {
    let message = "";
    try {
      parseEnv("auth", { ...auth, NEXT_PUBLIC_BETTER_AUTH_SECRET: "leaky-value" });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("NEXT_PUBLIC_BETTER_AUTH_SECRET");
    expect(message).not.toContain("leaky-value");
  });

  it("rejects a NEXT_PUBLIC_ secret that belongs to a different group", () => {
    expect(() =>
      parseEnv("database", {
        DATABASE_URL: "db-value",
        NEXT_PUBLIC_GHL_CLIENT_SECRET: "leaky-value",
      }),
    ).toThrow(/NEXT_PUBLIC_GHL_CLIENT_SECRET/);
  });

  it("trims whitespace around values, such as a pasted trailing newline", () => {
    expect(parseEnv("database", { DATABASE_URL: "  db-value\n" })).toEqual({
      DATABASE_URL: "db-value",
    });
  });

  describe("highlevel group", () => {
    const highlevel = {
      GHL_APP_ID: "app-id",
      GHL_CLIENT_ID: "client-id",
      GHL_CLIENT_SECRET: "client-secret",
      GHL_APP_SHARED_SECRET: "shared-secret",
      GHL_REDIRECT_URI: "https://app.example.test/api/integrations/oauth/callback",
      GHL_API_BASE_URL: "https://api.example.test",
      GHL_INSTALL_BASE_URL: "https://install.example.test",
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    };

    it("accepts a valid encryption key", () => {
      expect(parseEnv("highlevel", highlevel)).toEqual(highlevel);
    });

    it("accepts a pasted key with a trailing newline and returns it trimmed", () => {
      const padded = { ...highlevel, TOKEN_ENCRYPTION_KEY: `${highlevel.TOKEN_ENCRYPTION_KEY}\n` };
      expect(parseEnv("highlevel", padded)).toEqual(highlevel);
    });

    it("fails at startup on a malformed encryption key, naming the variable only", () => {
      let message = "";
      try {
        parseEnv("highlevel", { ...highlevel, TOKEN_ENCRYPTION_KEY: "not-a-valid-key" });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain("TOKEN_ENCRYPTION_KEY");
      expect(message).not.toContain("not-a-valid-key");
    });
  });

  it("rejects a NEXT_PUBLIC_ copy of the direct database URL", () => {
    expect(() =>
      parseEnv("auth", { ...auth, NEXT_PUBLIC_DATABASE_URL_UNPOOLED: "leaky-value" }),
    ).toThrow(/NEXT_PUBLIC_DATABASE_URL_UNPOOLED/);
  });

  it("allows a NEXT_PUBLIC_ name that is not a secret", () => {
    expect(parseEnv("auth", { ...auth, NEXT_PUBLIC_APP_URL: "https://app.example.test" })).toEqual(
      auth,
    );
  });

  describe("HighLevel URLs", () => {
    const base = {
      GHL_APP_ID: "a",
      GHL_CLIENT_ID: "b",
      GHL_CLIENT_SECRET: "c",
      GHL_APP_SHARED_SECRET: "d",
      GHL_REDIRECT_URI: "https://app.example.test/cb",
      GHL_API_BASE_URL: "https://api.example.test",
      GHL_INSTALL_BASE_URL: "https://install.example.test",
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    };

    it.each([
      ["GHL_API_BASE_URL", "http://api.example.test"],
      ["GHL_API_BASE_URL", "not a url"],
      ["GHL_INSTALL_BASE_URL", "http://install.example.test"],
      ["GHL_INSTALL_BASE_URL", "javascript:alert(1)"],
      ["GHL_REDIRECT_URI", "http://app.example.test/cb"],
    ])("rejects %s = %s and names only the variable", (name, value) => {
      let message = "";
      try {
        parseEnv("highlevel", { ...base, [name]: value });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(name);
      expect(message).not.toContain(value);
    });

    it("accepts https URLs", () => {
      expect(parseEnv("highlevel", base).GHL_API_BASE_URL).toBe("https://api.example.test");
    });
  });
});
