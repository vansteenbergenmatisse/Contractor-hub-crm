import { describe, expect, it, vi } from "vitest";

// getRequestUser must be wrapped in React's per-request cache, so the root layout, the (app) layout,
// a page and metadata share ONE user lookup (each lookup also hits the database). Outside a React
// server render `cache` does not memoize, so the test stands in a memoizing cache and checks the wrap.
const { currentUserFromHeaders, cacheSpy } = vi.hoisted(() => ({
  currentUserFromHeaders: vi.fn(async () => ({ tenantId: "T1" })),
  cacheSpy: vi.fn(<F extends (...a: never[]) => unknown>(fn: F) => {
    let memo: ReturnType<F> | undefined;
    return ((...a: Parameters<F>) => (memo ??= fn(...a) as ReturnType<F>)) as F;
  }),
}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: cacheSpy }));
vi.mock("@/features/auth", () => ({ currentUserFromHeaders }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { getRequestUser } from "../../src/app/session";

describe("getRequestUser", () => {
  it("is wrapped in React cache: two calls in one request do one lookup", async () => {
    const [a, b] = [await getRequestUser(), await getRequestUser()];
    expect(a).toEqual({ tenantId: "T1" });
    expect(b).toBe(a);
    expect(currentUserFromHeaders).toHaveBeenCalledTimes(1);
  });
});
