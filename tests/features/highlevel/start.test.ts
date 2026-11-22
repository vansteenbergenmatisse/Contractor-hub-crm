import { describe, expect, it } from "vitest";
import { handleOAuthStart } from "@/features/highlevel";

// The 37 scopes of docs/greenlane/build-prompt.md section 14, written out here on purpose.
const SPEC_SCOPES = [
  "oauth.readonly", "oauth.write", "locations.readonly", "locations/customValues.readonly",
  "locations/customValues.write", "locations/tags.readonly", "locations/customFields.readonly",
  "users.readonly", "contacts.readonly", "contacts.write", "opportunities.readonly",
  "opportunities.write", "pipelines.readonly", "calendars.readonly", "calendars.write",
  "calendars/events.readonly", "calendars/events.write", "calendars/groups.readonly",
  "calendars/groups.write", "calendars/resources.readonly", "calendars/resources.write",
  "conversations.readonly", "conversations.write", "conversations/message.readonly",
  "conversations/message.write", "invoices.readonly", "invoices.write",
  "invoices/estimate.readonly", "invoices/estimate.write", "payments/transactions.readonly",
  "workflows.readonly", "workflows.write", "workflows.delete", "workflows.publish",
  "workflows.logs", "phonenumbers.read", "socialplanner/account.readonly",
];

const config = {
  installBaseUrl: "https://install.example.test",
  clientId: "client-id-1",
  redirectUri: "https://app.example.test/api/integrations/oauth/callback",
};
const SECRET = Buffer.alloc(32, 9).toString("base64");
const request = new Request("https://app.example.test/api/integrations/oauth/start");

describe("OAuth start", () => {
  it("redirects an admin to the install URL with a fresh state and sets the state cookie", async () => {
    const response = await handleOAuthStart(request, { config, isAdmin: async () => true, stateSecret: SECRET });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") as string);
    expect(location.origin + location.pathname).toBe("https://install.example.test/oauth/chooselocation");
    const params = Object.fromEntries(location.searchParams);
    expect(params.response_type).toBe("code");
    expect(params.client_id).toBe("client-id-1");
    expect(params.redirect_uri).toBe(config.redirectUri);
    expect(params.scope.split(" ")).toEqual(SPEC_SCOPES);
    expect(params.state).toMatch(/^[A-Za-z0-9_-]{22}\.\d+\.[A-Za-z0-9_-]{43}$/); // nonce.expiry.signature

    const [pair, ...attributes] = (response.headers.get("set-cookie") as string).split("; ");
    expect(pair).toBe(`__Secure-gl_oauth_state=${params.state}`);
    expect(attributes.sort()).toEqual(
      ["HttpOnly", "Max-Age=600", "Path=/api/integrations/oauth", "SameSite=Lax", "Secure"].sort(),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("uses a different state every time", async () => {
    const states = new Set<string>();
    for (let i = 0; i < 20; i += 1) {
      const response = await handleOAuthStart(request, { config, isAdmin: async () => true, stateSecret: SECRET });
      states.add(new URL(response.headers.get("location") as string).searchParams.get("state") as string);
    }
    expect(states.size).toBe(20);
  });

  it("denies a non-admin with 403, no redirect and no cookie", async () => {
    const response = await handleOAuthStart(request, { config, isAdmin: async () => false, stateSecret: SECRET });
    expect(response.status).toBe(403);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed when the admin check throws", async () => {
    const response = await handleOAuthStart(request, {
      config,
      stateSecret: SECRET,
      isAdmin: async () => {
        throw new Error("auth down");
      },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("keeps the redirect on the install host when the base URL has a path or trailing slash", async () => {
    const response = await handleOAuthStart(request, {
      config: { ...config, installBaseUrl: "https://install.example.test/some/path/" },
      isAdmin: async () => true,
      stateSecret: SECRET,
    });
    const location = new URL(response.headers.get("location") as string);
    expect(location.origin).toBe("https://install.example.test");
    expect(location.pathname).toBe("/oauth/chooselocation");
  });

  it("puts the state in the cookie and the redirect only, never in a body", async () => {
    const response = await handleOAuthStart(request, { config, isAdmin: async () => true, stateSecret: SECRET });
    expect(await response.text()).toBe("");
  });

  it("expires the state ten minutes after it was minted", async () => {
    const now = new Date("2026-11-21T10:00:00.000Z");
    const response = await handleOAuthStart(request, { config, isAdmin: async () => true, stateSecret: SECRET, now: () => now });
    const state = new URL(response.headers.get("location") as string).searchParams.get("state") as string;
    expect(Number(state.split(".")[1])).toBe(now.getTime() + 600_000);
  });
});

describe("OAuth start: draft app version and scope override", () => {
  const paramsOf = async (extra: Record<string, unknown>) => {
    const response = await handleOAuthStart(request, {
      config: { ...config, ...extra },
      isAdmin: async () => true,
      stateSecret: SECRET,
    });
    return new URL(response.headers.get("location") as string).searchParams;
  };

  it("adds version_id when a draft app version id is configured", async () => {
    expect((await paramsOf({ versionId: "ver-1" })).get("version_id")).toBe("ver-1");
  });

  it.each([undefined, "", "   "])("leaves version_id out when it is %j", async (versionId) => {
    expect((await paramsOf({ versionId })).has("version_id")).toBe(false);
  });

  it("uses the configured scopes instead of the default list", async () => {
    expect((await paramsOf({ scopes: ["a.read", "b.write"] })).get("scope")).toBe("a.read b.write");
  });
});
