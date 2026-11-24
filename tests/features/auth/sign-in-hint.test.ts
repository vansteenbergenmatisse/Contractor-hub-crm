import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, createInvitedUser, issueDeviceToken } from "@/features/auth";
import {
  encodeSignInHint,
  maskEmailHint,
  parseSignInHint,
  resolveSignInPage,
  SIGN_IN_HINT_COOKIE,
  SIGN_IN_HINT_MAX_AGE_SECONDS,
} from "../../../src/features/auth/api/sign-in-hint";

// After a long session ends, /sign-in remembers (in a first-party cookie that grants nothing) which
// business and which masked email this browser used, so the way back is one tap.
const BASE = "https://app.example.test";
afterEach(() => vi.restoreAllMocks());

describe("maskEmailHint", () => {
  it.each([
    ["john.doe@gmail.com", "j•••@g•••.com"],
    ["j@x.io", "j•••@x•••.io"],
    ["john+crm@gmail.com", "j•••@g•••.com"],
    ["Pat@Mail.Example.co.uk", "p•••@m•••.uk"],
  ])("%s -> %s", (email, masked) => {
    expect(maskEmailHint(email)).toBe(masked);
  });

  it("never returns the local part or the domain name in full", () => {
    const masked = maskEmailHint("secretname+tag@privatehost.com") ?? "";
    expect(masked).not.toContain("secretname");
    expect(masked).not.toContain("tag");
    expect(masked).not.toContain("privatehost");
  });

  it("returns null for something that is not an email", () => {
    for (const value of ["", "nobody", "@x.com", "a@", "a@nodot", "a b@x.com"]) expect(maskEmailHint(value)).toBeNull();
  });
});

describe("hint cookie value", () => {
  it("round-trips the slug and the masked email, never the full email", () => {
    const raw = encodeSignInHint({ slug: "sample-roofing", email: "john@gmail.com" });
    expect(raw).not.toContain("john");
    expect(Buffer.from(raw, "base64url").toString("utf8")).not.toContain("john@");
    expect(parseSignInHint(raw)).toEqual({ slug: "sample-roofing", email: "j•••@g•••.com" });
  });

  it("drops a hint with an invalid slug or an odd email, and garbage", () => {
    const forge = (value: object) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
    expect(parseSignInHint(forge({ s: "https://evil.test", e: "j•••@g•••.com" }))).toBeNull();
    expect(parseSignInHint(forge({ s: "ok-slug", e: "john@gmail.com" }))).toBeNull();
    expect(parseSignInHint("%%%")).toBeNull();
    expect(parseSignInHint(undefined)).toBeNull();
    expect(parseSignInHint(forge({ s: null, e: "j•••@g•••.com" }))).toEqual({ slug: null, email: "j•••@g•••.com" });
  });

  it("lives 400 days, the most a browser keeps a cookie", () => {
    expect(SIGN_IN_HINT_MAX_AGE_SECONDS).toBe(400 * 24 * 3600);
  });
});

describe("resolveSignInPage", () => {
  const TEMPLATE = "https://app.example-hl.test/v2/location/{locationId}/custom-menu-link/m";
  const hint = encodeSignInHint({ slug: "sample-roofing", email: "john@gmail.com" });

  it("with a known hint: the masked email and the direct link to that client's CRM page", async () => {
    const findLocationId = vi.fn(async (slug: string) => (slug === "sample-roofing" ? "loc_1" : null));
    const page = await resolveSignInPage({ client: undefined, hint }, { template: TEMPLATE, findLocationId });
    expect(page).toEqual({
      brandClient: "sample-roofing",
      hint: { email: "j•••@g•••.com" },
      highLevel: { href: "https://app.example-hl.test/v2/location/loc_1/custom-menu-link/m", direct: true },
    });
  });

  it("an unknown slug in the cookie gives the generic page", async () => {
    const page = await resolveSignInPage({ client: undefined, hint }, { template: TEMPLATE, findLocationId: async () => null });
    expect(page).toEqual({ brandClient: undefined, hint: null, highLevel: { href: "https://app.example-hl.test/", direct: false } });
  });

  it("another client's link wins and the hint is not shown", async () => {
    const page = await resolveSignInPage({ client: "other-co", hint }, { template: TEMPLATE, findLocationId: async () => "loc_2" });
    expect(page.hint).toBeNull();
    expect(page.brandClient).toBe("other-co");
  });

  it("no hint: today's behavior", async () => {
    const findLocationId = vi.fn(async () => "loc_1");
    const page = await resolveSignInPage({ client: undefined, hint: undefined }, { template: TEMPLATE, findLocationId });
    expect(page).toEqual({ brandClient: undefined, hint: null, highLevel: { href: "https://app.example-hl.test/", direct: false } });
    expect(findLocationId).not.toHaveBeenCalled();
  });
});

describe("the hint cookie is set when a long session is created", () => {
  function setup() {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const db = { user: [], session: [], account: [], verification: [], rateLimit: [], tenantSignInLink: [] };
    const auth = createAuth({
      database: memoryAdapter(db),
      secret: Buffer.alloc(32, 7).toString("base64"), baseURL: BASE,
      emailSender: { send: async () => ({ delivered: false }) },
      deviceSignIn: true,
      signInHint: { slugForTenant: async (tenantId) => (tenantId === "T1" ? "sample-roofing" : null) },
    });
    return { auth, db };
  }
  const hintCookie = (response: Response) => response.headers.getSetCookie().find((c) => c.startsWith(`${SIGN_IN_HINT_COOKIE}=`));
  const signIn = (auth: ReturnType<typeof createAuth>, email: string) =>
    auth.handler(new Request(`${BASE}/api/auth/sign-in/email`, {
      method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ email, password: "correct horse battery" }),
    }));

  it("on password sign-in: httpOnly, Lax, 400 days, masked email and the client slug", async () => {
    const { auth } = setup();
    await createInvitedUser(auth, { email: "john@gmail.com", name: "J", password: "correct horse battery", role: "owner", tenantId: "T1" });
    const response = await signIn(auth, "john@gmail.com");
    expect(response.status).toBe(200);
    const cookie = hintCookie(response) ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toContain(`Max-Age=${400 * 24 * 3600}`);
    expect(cookie).not.toContain("john");
    const value = decodeURIComponent(cookie.split(";")[0].slice(SIGN_IN_HINT_COOKIE.length + 1));
    expect(parseSignInHint(value)).toEqual({ slug: "sample-roofing", email: "j•••@g•••.com" });
  });

  it("on the full-screen handoff (device sign-in)", async () => {
    const { auth } = setup();
    const { userId } = await createInvitedUser(auth, { email: "pat@x.test", name: "P", password: "correct horse battery", role: "office", tenantId: "T1" });
    const { token } = await issueDeviceToken((await auth.$context).internalAdapter as never, { kind: "handoff", userId, tenantId: "T1" });
    const response = await auth.handler(new Request(`${BASE}/api/auth/device-sign-in`, {
      method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ token }),
    }));
    expect(response.status).toBe(200);
    const value = decodeURIComponent((hintCookie(response) ?? "").split(";")[0].slice(SIGN_IN_HINT_COOKIE.length + 1));
    expect(parseSignInHint(value)).toEqual({ slug: "sample-roofing", email: "p•••@x•••.test" });
  });

  it("not for Forge Forward staff (admin) and not on a failed sign-in", async () => {
    const { auth } = setup();
    await createInvitedUser(auth, { email: "staff@forge.test", name: "S", password: "correct horse battery", role: "admin", tenantId: null });
    expect(hintCookie(await signIn(auth, "staff@forge.test"))).toBeUndefined();
    expect(hintCookie(await signIn(auth, "nobody@forge.test"))).toBeUndefined();
  });

  it("the hint alone is no session", async () => {
    const { auth } = setup();
    const raw = encodeSignInHint({ slug: "sample-roofing", email: "john@gmail.com" });
    const session = await auth.api.getSession({ headers: new Headers({ cookie: `${SIGN_IN_HINT_COOKIE}=${raw}` }) });
    expect(session).toBeNull();
  });
});
