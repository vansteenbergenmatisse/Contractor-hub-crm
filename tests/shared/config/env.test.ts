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

  it("allows a NEXT_PUBLIC_ name that is not a secret", () => {
    expect(parseEnv("auth", { ...auth, NEXT_PUBLIC_APP_URL: "https://app.example.test" })).toEqual(
      auth,
    );
  });
});
