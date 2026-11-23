import { afterEach, describe, expect, it, vi } from "vitest";
import { createTokenService, HighLevelHttpError } from "@/features/highlevel";

afterEach(() => vi.restoreAllMocks());

describe("findAgencyToken when HighLevel refuses the agency refresh token", () => {
  it("answers null and logs a code without ids or tokens", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = { companyId: "co_secret", accessToken: "access-secret", refreshToken: "refresh-secret", expiresAt: new Date(0) };
    const service = createTokenService({
      now: () => new Date("2026-11-23T05:00:00.000Z"),
      client: {
        refreshToken: async () => { throw new HighLevelHttpError("refused", 401); },
        mintLocationToken: async () => { throw new Error("unused"); },
      },
      store: {
        readLocationState: async () => null,
        readAgencyState: async () => state,
        updateLocationLocked: async () => null,
        updateAgencyLocked: async (_id: string, decide: (s: typeof state) => Promise<unknown>) => { await decide(state); return state; },
      },
    } as unknown as Parameters<typeof createTokenService>[0]);
    await expect(service.findAgencyToken("co_secret")).resolves.toBeNull();
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("agency_unavailable");
    for (const secret of ["co_secret", "access-secret", "refresh-secret"]) expect(logged).not.toContain(secret);
  });
});
