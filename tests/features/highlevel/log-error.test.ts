import { afterEach, describe, expect, it, vi } from "vitest";
import { createHighLevelClient, describeError, HighLevelHttpError, logError, redact } from "@/features/highlevel";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("redact", () => {
  it("hides token-like JSON values", () => {
    const text = redact('{"access_token":"abc123","refresh_token":"def456","error":"invalid_grant"}');
    expect(text).not.toContain("abc123");
    expect(text).not.toContain("def456");
    expect(text).toContain("invalid_grant");
  });

  it("hides form-style secrets, bearer tokens, JWTs and URLs with credentials", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl";
    const text = redact(
      `client_secret=s3cret&code=c0de Authorization: Bearer tok.en-1 ${jwt} postgres://user:pw@host/db`,
    );
    for (const hidden of ["s3cret", "c0de", "tok.en-1", jwt, "user:pw"]) expect(text).not.toContain(hidden);
  });

  it("hides the values of configured secrets wherever they appear", () => {
    vi.stubEnv("GHL_CLIENT_SECRET", "my-client-secret-value");
    expect(redact("failed for my-client-secret-value here")).toBe("failed for [redacted] here");
  });

  it("ignores a very short or empty secret value instead of blanking the text", () => {
    vi.stubEnv("GHL_CLIENT_SECRET", "ab");
    expect(redact("abc")).toBe("abc");
  });
});

describe("describeError", () => {
  it("gives name, redacted message and stack", () => {
    const error = new Error("boom access_token=abc123");
    const described = describeError(error);
    expect(described.name).toBe("Error");
    expect(described.message).toContain("boom");
    expect(described.message).not.toContain("abc123");
    expect(described.stack).toContain("log-error.test");
  });

  it("gives the status and the redacted, truncated body of a HighLevel error", () => {
    const error = new HighLevelHttpError("HighLevel token exchange failed (status 400).", 400, {
      body: `{"error":"invalid_grant","refresh_token":"zzz999"}${"x".repeat(2000)}`,
    });
    const described = describeError(error);
    expect(described.status).toBe(400);
    expect(described.body).toContain("invalid_grant");
    expect(described.body).not.toContain("zzz999");
    expect((described.body ?? "").length).toBeLessThanOrEqual(600);
  });

  it("copes with a thrown non-error", () => {
    expect(describeError("plain").name).toBe("unknown error");
  });
});

describe("logError", () => {
  it("writes one console.error line carrying the context and the details", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logError("HighLevel install failed (token exchange)", new HighLevelHttpError("failed (status 401).", 401, { body: '{"error":"bad"}' }));
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    expect(line).toContain("HighLevel install failed (token exchange)");
    expect(line).toContain("401");
    expect(line).toContain("bad");
  });
});

describe("HighLevel client keeps the response body out of the message", () => {
  it("carries the body only in detail", async () => {
    const client = createHighLevelClient({
      baseUrl: "https://api.example.test",
      appId: "app",
      clientId: "cid",
      clientSecret: "csecret-value",
      redirectUri: "https://app.example.test/cb",
      fetch: async () => new Response('{"error":"invalid_client","error_description":"bad"}', { status: 401 }),
    });
    const error = (await client.exchangeAgencyCode("c").then(
      () => null,
      (e: unknown) => e,
    )) as HighLevelHttpError;
    expect(error).toBeInstanceOf(HighLevelHttpError);
    expect(error.status).toBe(401);
    expect(error.message).not.toContain("invalid_client");
    expect(error.detail).toContain("invalid_client");
  });
});
