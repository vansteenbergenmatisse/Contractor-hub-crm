import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleLeadCreate, handleLeadsExport, loadLeads } from "@/features/leads";
import { contactClaimKeys, createContactOnce, type ContactCreateOutcome } from "@/features/highlevel";

const ORIGIN = "https://app.test";
const NOW = new Date("2026-03-04T12:00:00.000Z");
const SECRET = "test-secret-not-real";
type TestUser = { id: string; role: "owner" | "office" | "admin"; tenantId: string | null; viewing?: boolean };
const owner: TestUser = { id: "u1", role: "owner", tenantId: "t1" };
const post = (body: unknown) =>
  new Request(`${ORIGIN}/api/leads/x`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(body) });

const exportDeps = (user: TestUser | null = owner) => ({
  appOrigin: ORIGIN,
  currentUser: vi.fn(async () => user),
  hit: vi.fn(async () => true),
  now: () => NOW,
  read: vi.fn(async () => ({
    ok: true as const, complete: true, dropped: 0,
    contacts: [{ name: "Pat", source: "Email", dateAdded: "2026-03-04T10:00:00.000Z", phone: null, email: null, address: null }],
  })),
  readZone: vi.fn(async () => "America/New_York"),
});

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("export obeys LEADS_READ_DISABLED", () => {
  it("still gives an owner the CSV when the flag is unset", async () => {
    vi.stubEnv("LEADS_READ_DISABLED", "");
    const deps = exportDeps();
    const res = await handleLeadsExport(post({}), deps);
    expect(res.status).toBe(200);
    expect(deps.read).toHaveBeenCalledWith("t1");
  });

  it.each(["true", " true ", "true\n"])("flag %j stops before the limiter and the read", async (value) => {
    vi.stubEnv("LEADS_READ_DISABLED", value);
    const deps = exportDeps();
    const res = await handleLeadsExport(post({ includeContact: true }), deps);
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(deps.hit).not.toHaveBeenCalled();
    expect(deps.read).not.toHaveBeenCalled();
    expect(deps.readZone).not.toHaveBeenCalled();
  });

  it.each(["false", "1", "TRUE", "yes"])("flag %j matches the Leads page and leaves the read on", async (value) => {
    vi.stubEnv("LEADS_READ_DISABLED", value);
    const deps = exportDeps();
    expect((await handleLeadsExport(post({}), deps)).status).toBe(200);
    const page = await loadLeads("t1", async () => ({ ok: true as const, contacts: [], complete: true, dropped: 0 }), () => NOW);
    expect(page.state).toBe("empty");
  });

  it.each([
    ["no session", null, 401],
    ["office", { id: "u2", role: "office", tenantId: "t1" } as TestUser, 403],
    ["View as client", { id: "a1", role: "admin", tenantId: "t1", viewing: true } as TestUser, 403],
  ])("%s keeps its own answer with the flag on", async (_name, user, status) => {
    vi.stubEnv("LEADS_READ_DISABLED", "true");
    const deps = exportDeps(user);
    expect((await handleLeadsExport(post({}), deps)).status).toBe(status);
    expect(deps.read).not.toHaveBeenCalled();
  });

  it("reads the session tenant, never one from the body", async () => {
    const deps = exportDeps();
    await handleLeadsExport(post({ tenantId: "t2" }), deps);
    expect(deps.read).toHaveBeenCalledWith("t1");
    expect(deps.read).not.toHaveBeenCalledWith("t2");
  });
});

// An in-memory copy of the atomic claim: the first caller of a key wins.
const memoryClaim = () => {
  const taken = new Set<string>();
  return vi.fn(async (key: string) => {
    if (taken.has(key)) return false;
    taken.add(key);
    return true;
  });
};
const input = { name: "Pat", phone: "(555) 010-0000", email: "Pat@Example.test", address: "", source: "Email" };

describe("contact create claim", () => {
  it("creates once for a single request", async () => {
    const create = vi.fn(async (): Promise<ContactCreateOutcome> => ({ status: "created" }));
    expect(await createContactOnce("t1", input, { secret: SECRET, claim: memoryClaim(), create })).toEqual({ status: "created" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("lets only one of two identical concurrent requests create", async () => {
    const claim = memoryClaim();
    const create = vi.fn(async (): Promise<ContactCreateOutcome> => ({ status: "created" }));
    const out = await Promise.all([
      createContactOnce("t1", input, { secret: SECRET, claim, create }),
      createContactOnce("t1", { ...input, phone: "+1 555 010 0000", email: " pat@example.test " }, { secret: SECRET, claim, create }),
    ]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(out.map((o) => o.status).sort()).toEqual(["created", "in_progress"]);
  });

  it("blocks the same email with a different phone", async () => {
    const claim = memoryClaim();
    const create = vi.fn(async (): Promise<ContactCreateOutcome> => ({ status: "created" }));
    await createContactOnce("t1", input, { secret: SECRET, claim, create });
    const second = await createContactOnce("t1", { ...input, phone: "5550100001" }, { secret: SECRET, claim, create });
    expect(second).toEqual({ status: "in_progress" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not block the same phone in another tenant", async () => {
    const claim = memoryClaim();
    const create = vi.fn(async (): Promise<ContactCreateOutcome> => ({ status: "created" }));
    await createContactOnce("t1", input, { secret: SECRET, claim, create });
    expect(await createContactOnce("t2", input, { secret: SECRET, claim, create })).toEqual({ status: "created" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("normalizes phone and email variants to the same keys and holds no raw value", () => {
    const a = contactClaimKeys(SECRET, "t1", "(555) 010-0000", "Pat@Example.test");
    const b = contactClaimKeys(SECRET, "t1", "+1 555 010 0000", " pat@example.test ");
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
    const joined = (a ?? []).join("|").toLowerCase();
    for (const raw of ["5550100000", "pat", "example"]) expect(joined).not.toContain(raw);
  });

  it("uses a key that depends on the server secret", () => {
    expect(contactClaimKeys(SECRET, "t1", "5550100000", "")).not.toEqual(contactClaimKeys("other-secret", "t1", "5550100000", ""));
  });

  it("never creates on an invalid phone", async () => {
    const claim = memoryClaim();
    const create = vi.fn(async (): Promise<ContactCreateOutcome> => ({ status: "created" }));
    expect(await createContactOnce("t1", { ...input, phone: "12" }, { secret: SECRET, claim, create })).toEqual({ status: "invalid_phone" });
    expect(claim).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("fails closed when the claim store fails", async () => {
    const create = vi.fn(async (): Promise<ContactCreateOutcome> => ({ status: "created" }));
    const claim = vi.fn(async () => { throw new Error("db down"); });
    expect(await createContactOnce("t1", input, { secret: SECRET, claim, create })).toEqual({ status: "failed" });
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["no session", null, 401],
    ["View as client", { id: "a1", role: "admin", tenantId: "t1", viewing: true } as TestUser, 403],
  ])("%s never reaches create through the route", async (_name, user, status) => {
    const create = vi.fn(async (): Promise<ContactCreateOutcome> => ({ status: "created" }));
    const res = await handleLeadCreate(post({ name: "Pat", phone: "5550100000", source: "email" }), {
      appOrigin: ORIGIN, currentUser: vi.fn(async () => user), hit: vi.fn(async () => true), now: () => NOW, isEnabled: () => true, create,
    });
    expect(res.status).toBe(status);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns in_progress to the browser", async () => {
    const res = await handleLeadCreate(post({ name: "Pat", phone: "5550100000", source: "email" }), {
      appOrigin: ORIGIN, currentUser: vi.fn(async () => owner), hit: vi.fn(async () => true), now: () => NOW, isEnabled: () => true,
      create: async () => ({ status: "in_progress" }),
    });
    expect(await res.json()).toEqual({ status: "in_progress" });
  });
});
