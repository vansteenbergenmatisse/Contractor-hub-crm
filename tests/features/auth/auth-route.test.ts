import { afterEach, describe, expect, it, vi } from "vitest";
import { authRoute } from "@/features/auth";

afterEach(() => vi.unstubAllEnvs());

describe("/api/auth route wiring", () => {
  it("answers 500 with a fixed body and no env names or values when the auth env is missing", async () => {
    for (const name of ["APP_URL", "BETTER_AUTH_URL", "BETTER_AUTH_SECRET"]) vi.stubEnv(name, "");
    const response = await authRoute(new Request("https://app.example.test/api/auth/get-session"));
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).toBe("Server is not configured.");
  });

  it("refuses a secret that is shipped to the browser (NEXT_PUBLIC_ prefix) instead of starting", async () => {
    vi.stubEnv("APP_URL", "https://app.example.test");
    vi.stubEnv("BETTER_AUTH_URL", "https://app.example.test");
    vi.stubEnv("BETTER_AUTH_SECRET", Buffer.alloc(32, 1).toString("base64"));
    vi.stubEnv("NEXT_PUBLIC_BETTER_AUTH_SECRET", "x");
    const response = await authRoute(new Request("https://app.example.test/api/auth/get-session"));
    expect(response.status).toBe(500);
  });
});
