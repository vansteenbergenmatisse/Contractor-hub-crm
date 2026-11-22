import { afterEach, describe, expect, it, vi } from "vitest";

// The set-password mail to the people of a real client stays off until ONBOARDING_SEND_SET_PASSWORD=true.
const parseEnv = vi.fn(() => ({ APP_URL: "https://app.example.test", BETTER_AUTH_URL: "https://auth.example.test", BETTER_AUTH_SECRET: "x".repeat(32) }));
const requestPasswordReset = vi.fn(async () => ({}));
vi.mock("@/shared/config", () => ({ parseEnv }));
vi.mock("../../../src/features/auth/db/auth-database", () => ({ prismaAuthDatabase: () => ({}) }));
vi.mock("../../../src/features/auth/api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/features/auth/api/auth")>()),
  createAuth: () => ({ api: { requestPasswordReset }, $context: Promise.resolve({ internalAdapter: {} }) }),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("sendSetPassword", () => {
  it("sends nothing and says so when the variable is not 'true'", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("ONBOARDING_SEND_SET_PASSWORD", "");
    const { getProvisionDeps } = await import("../../../src/features/auth/api/instance");
    await getProvisionDeps().sendSetPassword("pat@x.test");
    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(String(info.mock.calls.at(-1)?.[0])).toContain("skipped");
    expect(String(info.mock.calls.at(-1)?.[0])).not.toContain("pat@x.test");
    info.mockRestore();
  });

  it.each(["TRUE", "1", "yes", " false"])("treats %j as off", async (value) => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("ONBOARDING_SEND_SET_PASSWORD", value);
    const { getProvisionDeps } = await import("../../../src/features/auth/api/instance");
    await getProvisionDeps().sendSetPassword("pat@x.test");
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("requests the reset on the Better Auth base URL when it is 'true'", async () => {
    vi.stubEnv("ONBOARDING_SEND_SET_PASSWORD", "true");
    const { getProvisionDeps } = await import("../../../src/features/auth/api/instance");
    await getProvisionDeps().sendSetPassword("pat@x.test");
    expect(requestPasswordReset).toHaveBeenCalledWith({ body: { email: "pat@x.test", redirectTo: "https://auth.example.test/reset-password" } });
  });
});
