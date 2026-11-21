import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleOAuthCallback, handleOAuthStart } from "@/features/highlevel";
import type { OAuthCallbackDeps } from "@/features/highlevel";

// Ticket 3 gap (b): the signed OAuth state is bound to the admin who started the install, and
// /callback only accepts it for that same admin session.
const NOW = new Date("2026-11-21T10:00:00.000Z");
const SECRET = Buffer.alloc(32, 9).toString("base64");
const COOKIE = "__Secure-gl_oauth_state";
const startConfig = {
  installBaseUrl: "https://install.example.test",
  clientId: "c",
  redirectUri: "https://app.example.test/cb",
};

async function start(adminId: string | null | "throw", secret = SECRET) {
  return handleOAuthStart(new Request("https://app.example.test/start"), {
    config: startConfig,
    isAdmin: async () => true,
    getAdminId: async () => {
      if (adminId === "throw") throw new Error("session store down");
      return adminId;
    },
    stateSecret: secret,
    now: () => NOW,
  });
}
const stateOf = (response: Response) =>
  new URL(response.headers.get("location") as string).searchParams.get("state") as string;

let exchange: ReturnType<typeof vi.fn>;
let deps: OAuthCallbackDeps;
beforeEach(() => {
  exchange = vi.fn(async () => ({ accessToken: "a", refreshToken: "r", expiresInSeconds: 86399, companyId: "company_1" }));
  deps = {
    client: {
      exchangeAgencyCode: exchange as unknown as OAuthCallbackDeps["client"]["exchangeAgencyCode"],
      listInstalledLocations: async () => [],
      mintLocationToken: async () => {
        throw new Error("unused");
      },
    },
    store: { saveAgencyConnection: async () => {}, saveLocationConnection: async () => ({ tenantId: "t" }) },
    now: () => NOW,
    stateSecret: SECRET,
    currentAdminId: async () => "admin_1",
  };
});

const callbackRequest = (state: string, cookieState = state) =>
  new Request(`https://app.example.test/cb?code=code-1&state=${state}`, { headers: { cookie: `${COOKIE}=${cookieState}` } });

describe("start binds the state to the admin", () => {
  it("answers 403 when there is no admin session, or the session lookup throws", async () => {
    expect((await start(null)).status).toBe(403);
    expect((await start("throw")).status).toBe(403);
  });

  it("answers 403 when isAdmin says no, even though a session id exists", async () => {
    const response = await handleOAuthStart(new Request("https://app.example.test/start"), {
      config: startConfig,
      isAdmin: async () => false,
      getAdminId: async () => "admin_1",
      stateSecret: SECRET,
    });
    expect(response.status).toBe(403);
  });

  it("refuses an admin id too long to bind", async () => {
    expect((await start("x".repeat(300))).status).toBe(403);
  });

  it("mints a different state for each admin and sets the cookie to it", async () => {
    const one = await start("admin_1");
    const two = await start("admin_2");
    expect(one.status).toBe(302);
    expect(stateOf(one)).not.toBe(stateOf(two));
    expect(one.headers.get("set-cookie")).toContain(`${COOKIE}=${stateOf(one)}`);
  });
});

describe("callback checks the binding", () => {
  it("accepts the state for the same admin session", async () => {
    const state = stateOf(await start("admin_1"));
    const response = await handleOAuthCallback(callbackRequest(state), deps);
    expect(response.status).toBe(200);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it("rejects a state bound to another admin (cross-session replay), exchanges nothing, keeps the cookie", async () => {
    const state = stateOf(await start("admin_attacker"));
    const response = await handleOAuthCallback(callbackRequest(state), deps); // victim session is admin_1
    expect(response.status).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("answers 403 and exchanges nothing without an admin session, or when the lookup throws", async () => {
    const state = stateOf(await start("admin_1"));
    for (const currentAdminId of [async () => null, async () => { throw new Error("down"); }]) {
      const response = await handleOAuthCallback(callbackRequest(state), { ...deps, currentAdminId });
      expect(response.status).toBe(403);
    }
    expect(exchange).not.toHaveBeenCalled();
  });

  it("rejects an unbound state when a session check is configured", async () => {
    const unbound = stateOf(
      await handleOAuthStart(new Request("https://app.example.test/start"), {
        config: startConfig, isAdmin: async () => true, stateSecret: SECRET, now: () => NOW,
      }),
    );
    const response = await handleOAuthCallback(callbackRequest(unbound), deps);
    expect(response.status).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("rejects a bound state when no session check is configured (fails closed)", async () => {
    const state = stateOf(await start("admin_1"));
    const { currentAdminId, ...withoutCheck } = deps;
    void currentAdminId;
    expect((await handleOAuthCallback(callbackRequest(state), withoutCheck)).status).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("rejects a state whose bound admin segment was swapped for the victim's", async () => {
    const attacker = stateOf(await start("admin_attacker")).split(".");
    const victim = stateOf(await start("admin_1")).split(".");
    const forged = [attacker[0], attacker[1], victim[2], attacker[3]].join(".");
    const response = await handleOAuthCallback(callbackRequest(forged), deps);
    expect(response.status).toBe(400);
    expect(exchange).not.toHaveBeenCalled();
  });

  it("rejects a bound state signed with another secret", async () => {
    const state = stateOf(await start("admin_1", Buffer.alloc(32, 3).toString("base64")));
    expect((await handleOAuthCallback(callbackRequest(state), deps)).status).toBe(400);
  });

  it("rejects an expired bound state", async () => {
    const state = stateOf(await start("admin_1"));
    const late = { ...deps, now: () => new Date(NOW.getTime() + 10 * 60 * 1000 + 1) };
    expect((await handleOAuthCallback(callbackRequest(state), late)).status).toBe(400);
  });

  it("does not accept ids that only differ by case or a trailing character", async () => {
    const state = stateOf(await start("admin_1"));
    for (const id of ["ADMIN_1", "admin_1 ", "admin_10", "admin_"]) {
      const response = await handleOAuthCallback(callbackRequest(state), { ...deps, currentAdminId: async () => id });
      expect(response.status).toBe(400);
    }
    expect(exchange).not.toHaveBeenCalled();
  });
});
