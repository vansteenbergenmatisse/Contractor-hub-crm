import { describe, expect, it, vi } from "vitest";
import { createHighLevelClient } from "@/features/highlevel";

// GET /oauth/installed-locations documents an optional `installToFutureLocations` boolean (public
// docs read 2026-11-24). Fixtures follow that page; values are fake.
const config = {
  baseUrl: "https://hl.example.test",
  appId: "app-id-1",
  clientId: "client-id-1",
  clientSecret: "client-secret-1",
  redirectUri: "https://app.example.test/api/integrations/oauth/callback",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const page = (extra: Record<string, unknown>) => ({ items: [], pagination: { hasNextPage: false, hasPrevPage: false, currentPageSize: 0 }, ...extra });

describe("readInstallToFutureLocations", () => {
  it("asks the v3 path with our appId and one item, and returns the flag", async () => {
    const fetchFn = vi.fn(async () => json(page({ installToFutureLocations: true })));
    const client = createHighLevelClient({ ...config, fetch: fetchFn });
    expect(await client.readInstallToFutureLocations("agency-token", "company_1")).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/oauth/installed-locations");
    expect(parsed.searchParams.get("companyId")).toBe("company_1");
    expect(parsed.searchParams.get("appId")).toBe("app-id-1");
    expect(parsed.searchParams.get("pageSize")).toBe("1");
    expect((init.headers as Record<string, string>).version).toBe("v3");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer agency-token");
  });

  it("false is passed on", async () => {
    const client = createHighLevelClient({ ...config, fetch: vi.fn(async () => json(page({ installToFutureLocations: false }))) });
    expect(await client.readInstallToFutureLocations("t", "c")).toBe(false);
  });

  it("a missing or non-boolean flag is unknown (null)", async () => {
    const client = createHighLevelClient({ ...config, fetch: vi.fn(async () => json(page({ installToFutureLocations: "yes" }))) });
    expect(await client.readInstallToFutureLocations("t", "c")).toBeNull();
    const absent = createHighLevelClient({ ...config, fetch: vi.fn(async () => json(page({}))) });
    expect(await absent.readInstallToFutureLocations("t", "c")).toBeNull();
  });

  it("a 404 is unknown; another failure throws", async () => {
    const missing = createHighLevelClient({ ...config, fetch: vi.fn(async () => json({}, 404)) });
    expect(await missing.readInstallToFutureLocations("t", "c")).toBeNull();
    const down = createHighLevelClient({ ...config, fetch: vi.fn(async () => json({}, 500)) });
    await expect(down.readInstallToFutureLocations("t", "c")).rejects.toThrow();
  });
});
