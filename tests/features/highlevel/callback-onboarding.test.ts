import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleOAuthCallback, handleOAuthStart } from "@/features/highlevel";
import type { OAuthCallbackDeps } from "@/features/highlevel";

// Company-token callback (the real case: Agency-only install) and the Location-token fallback.
const NOW = new Date("2026-11-22T10:00:00.000Z");
const SECRET = Buffer.alloc(32, 9).toString("base64");
async function mintState(): Promise<string> {
  const response = await handleOAuthStart(new Request("https://app.example.test/start"), {
    config: { installBaseUrl: "https://i.test", clientId: "c", redirectUri: "https://app.example.test/cb" },
    isAdmin: async () => true,
    stateSecret: SECRET,
    now: () => NOW,
  });
  return new URL(response.headers.get("location") as string).searchParams.get("state") as string;
}
const STATE = await mintState();
const request = () => new Request(`https://app.example.test/cb?code=c1&state=${STATE}`, { headers: { cookie: `__Secure-gl_oauth_state=${STATE}` } });

const company = { kind: "company" as const, accessToken: "ag-a", refreshToken: "ag-r", expiresInSeconds: 86399, companyId: "co_1" };
let deps: OAuthCallbackDeps;
let onboard: NonNullable<OAuthCallbackDeps["onboard"]>;
let saveAgency: ReturnType<typeof vi.fn<OAuthCallbackDeps["store"]["saveAgencyConnection"]>>;

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  saveAgency = vi.fn<OAuthCallbackDeps["store"]["saveAgencyConnection"]>(async () => {});
  onboard = {
    agencyLocations: vi.fn(async ({ locations }) => ({ installed: locations.length, failed: 0 })),
    singleLocation: vi.fn(async () => ({ installed: 1, failed: 0 })),
  };
  deps = {
    client: {
      exchangeAgencyCode: vi.fn(),
      listInstalledLocations: vi.fn(async () => [{ locationId: "loc_1", name: "A" }, { locationId: "loc_2", name: "B" }]),
      mintLocationToken: vi.fn(),
    },
    exchangeCode: vi.fn(async () => company),
    store: { saveAgencyConnection: saveAgency, saveLocationConnection: vi.fn() },
    now: () => NOW,
    stateSecret: SECRET,
    onboard,
  };
});

describe("callback with a Company token", () => {
  it("stores the agency token, then runs the onboarding sync for every installed location", async () => {
    const response = await handleOAuthCallback(request(), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ installed: 2, failed: 0 });
    expect(saveAgency).toHaveBeenCalledWith(expect.objectContaining({ companyId: "co_1", accessToken: "ag-a", refreshToken: "ag-r" }));
    expect(onboard.agencyLocations).toHaveBeenCalledWith({ companyId: "co_1", locations: [{ locationId: "loc_1", name: "A" }, { locationId: "loc_2", name: "B" }] });
    expect(deps.client.mintLocationToken).not.toHaveBeenCalled(); // the sync owns minting now
  });

  it("answers 502 with an empty body when every location fails, and 200 when some succeed", async () => {
    (onboard.agencyLocations as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ installed: 0, failed: 2 });
    expect((await handleOAuthCallback(request(), deps)).status).toBe(502);
    (onboard.agencyLocations as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ installed: 1, failed: 1 });
    expect((await handleOAuthCallback(request(), deps)).status).toBe(200);
  });

  it("logs the failing step when the onboarding sync throws, and answers 502 without a body", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    (onboard.agencyLocations as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const response = await handleOAuthCallback(request(), deps);
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("");
    expect(String(spy.mock.calls.at(-1)?.[0])).toContain("onboarding sync");
  });

  it("without an onboard dependency it still mints and saves a token per location (old path)", async () => {
    const { onboard: _drop, ...bare } = deps;
    void _drop;
    (bare.client.mintLocationToken as ReturnType<typeof vi.fn>).mockImplementation(async (_a: string, _c: string, locationId: string) => ({
      accessToken: "x", refreshToken: "y", expiresInSeconds: 86400, locationId,
    }));
    (bare.store.saveLocationConnection as ReturnType<typeof vi.fn>).mockResolvedValue({ tenantId: "t" });
    const response = await handleOAuthCallback(request(), bare);
    expect(await response.json()).toEqual({ installed: 2, failed: 0 });
  });
});

describe("callback with a Location token", () => {
  it("onboards that one location and does not list or mint", async () => {
    (deps.exchangeCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      kind: "location", accessToken: "la", refreshToken: "lr", expiresInSeconds: 86400, locationId: "loc_9", companyId: "co_1",
    });
    const response = await handleOAuthCallback(request(), deps);
    expect(response.status).toBe(200);
    expect(onboard.singleLocation).toHaveBeenCalledWith(expect.objectContaining({ companyId: "co_1", locationId: "loc_9", accessToken: "la", refreshToken: "lr" }));
    expect(saveAgency).not.toHaveBeenCalled();
    expect(deps.client.listInstalledLocations).not.toHaveBeenCalled();
  });

  it("is refused (502) when no onboarding is configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { onboard: _drop, ...bare } = deps;
    void _drop;
    (bare.exchangeCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ kind: "location", accessToken: "la", refreshToken: null, expiresInSeconds: 86400, locationId: "loc_9", companyId: "co_1" });
    expect((await handleOAuthCallback(request(), bare)).status).toBe(502);
  });
});
