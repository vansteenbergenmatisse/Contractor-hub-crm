import { beforeEach, describe, expect, it, vi } from "vitest";

// The real limiter wiring: a key prefix that has no rule is denied (fail closed), so every prefix a
// route uses must be registered. A route test with a fake limiter cannot catch a missing rule.
const hit = vi.fn(async () => true);
vi.mock("@/features/auth/db/rate-limit", () => ({ hitRateLimit: hit }));

beforeEach(() => hit.mockClear());

describe("getInviteLimiter rules", () => {
  it.each(["invite-create", "invite-preview", "invite-accept", "tenant-login"])("has a rule for %s", async (prefix) => {
    const { getInviteLimiter } = await import("../../../src/features/auth/api/instance");
    expect(await getInviteLimiter()(`${prefix}:someone`)).toBe(true);
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it("passes the documented limit and window to the counter", async () => {
    const { getInviteLimiter } = await import("../../../src/features/auth/api/instance");
    await getInviteLimiter()("tenant-login:a1");
    await getInviteLimiter()("invite-create:a1");
    expect(hit.mock.calls.map((c) => c.slice(0, 3))).toEqual([
      ["tenant-login:a1", 60, 3_600_000],
      ["invite-create:a1", 30, 3_600_000],
    ]);
  });

  it("denies an unknown prefix without touching the database", async () => {
    const { getInviteLimiter } = await import("../../../src/features/auth/api/instance");
    expect(await getInviteLimiter()("unknown:x")).toBe(false);
    expect(hit).not.toHaveBeenCalled();
  });
});
