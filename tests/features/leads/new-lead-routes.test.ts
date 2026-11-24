import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLeadsCsv, createPlacesSearch, csvCell, formatPhone, handleAddressSearch, handleLeadCreate, handleLeadsExport, inPeriod,
  isLeadsCreateEnabled, loadLeads, originFromRaw, originOf, sourceBreakdown, type Lead,
} from "@/features/leads";
import { createContactCreateAdapter, toE164, type ContactCreateRequests } from "@/features/highlevel";

const ORIGIN = "https://app.test";
const NOW = new Date("2026-03-04T12:00:00.000Z"); // a Wednesday
const owner = { id: "u1", role: "owner" as const, tenantId: "t1" };
const base = (user: unknown = owner) => ({
  appOrigin: ORIGIN,
  currentUser: vi.fn(async () => user as typeof owner | null),
  hit: vi.fn(async () => true),
  now: () => NOW,
});
const post = (body: unknown, origin: string | null = ORIGIN) =>
  new Request(`${ORIGIN}/api/leads/x`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
  });
const lead = (over: Partial<Lead> = {}): Lead => ({ id: "a", name: "A", source: null, need: "", minutesWaiting: 0, address: "", status: "new", receivedAt: "2026-03-04T11:00:00.000Z", ...over });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("lead sources never guess", () => {
  it.each([
    ["Email", "email"], ["Bing Places", "bing"], ["Google Ads", "gads"], ["Added by you", "you"], ["Web Form", "website"], ["SMS", "text"], ["GMB", "gmb"],
  ])("%s is %s", (raw, key) => expect(originFromRaw(raw)).toBe(key));
  it.each(["Google", "bing", "ads", "facebook ad", "website", "constructor", "", null])("%s stays Unknown", (raw) => expect(originFromRaw(raw)).toBe("unknown"));

  it("keeps the channel of a loaded contact", async () => {
    const read = async () => ({ ok: true as const, dropped: 0, complete: true, contacts: [{ id: "c", name: "P", address: null, city: null, state: null, postalCode: null, source: "Bing Places", dateAdded: "2026-03-04T10:00:00.000Z" }] });
    const out = await loadLeads("t", read, () => NOW);
    if (out.state !== "ready") throw new Error("not ready");
    expect(originOf(out.leads[0])).toBe("bing");
  });
});

describe("source periods in the location's zone", () => {
  const at = NOW.toISOString();
  it("puts a late-evening lead on the location's own day", () => {
    const ms = Date.parse("2026-03-04T03:00:00.000Z"); // still March 3 in New York
    expect(inPeriod(ms, "today", at, "America/New_York")).toBe(false);
    expect(inPeriod(ms, "today", at, "UTC")).toBe(true);
  });
  it("starts the week on Sunday", () => {
    expect(inPeriod(Date.parse("2026-03-01T12:00:00.000Z"), "week", at, "UTC")).toBe(true);
    expect(inPeriod(Date.parse("2026-02-28T12:00:00.000Z"), "week", at, "UTC")).toBe(false);
  });
  it("bounds the month", () => {
    expect(inPeriod(Date.parse("2026-03-01T00:30:00.000Z"), "month", at, "UTC")).toBe(true);
    expect(inPeriod(Date.parse("2026-03-01T00:30:00.000Z"), "month", at, "America/New_York")).toBe(false);
  });
  it("never proves All on a cut-off page, and proves a period the page reaches past", () => {
    const leads = [lead({ source: "fb" }), lead({ id: "b", receivedAt: "2026-01-01T00:00:00.000Z" })];
    const context = { loadedAt: at, timeZone: "UTC", complete: false, dropped: 0 };
    expect(sourceBreakdown(leads, 0, "all", context).proven).toBe(false);
    const week = sourceBreakdown(leads, 0, "week", context);
    expect(week.proven).toBe(true);
    expect(week.total).toBe(1);
    expect(week.rows.find((r) => r.key === "fb")?.count).toBe(1);
  });
  it("counts an unmatched lead as Unknown and a hand-added one as Added by you", () => {
    const out = sourceBreakdown([lead()], 2, "week", { loadedAt: at, timeZone: "UTC", complete: true, dropped: 0 });
    expect(out.rows.find((r) => r.key === "unknown")?.count).toBe(1);
    expect(out.rows.find((r) => r.key === "you")?.count).toBe(2);
    expect(out.rows.map((r) => r.label)).toEqual(["Call", "Text", "Email", "Website form", "Facebook", "Instagram", "Google My Business", "Bing Places", "Google Ads", "Added by you", "Unknown"]);
  });
});

describe("CSV", () => {
  it.each(["=1+1", "+1", "-1", "@x", "\t=1", "  =1"])("neutralizes %j", (value) => expect(csvCell(value).replace(/^"/, "").startsWith("'")).toBe(true));
  it("quotes per RFC 4180", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell("plain")).toBe("plain");
  });
  it.each([["+16145550100", "(614) 555-0100"], ["6145550100", "(614) 555-0100"], ["1 614 555 0100", "(614) 555-0100"], ["+442071234567", "+442071234567"]])("formats %s", (raw, out) => expect(formatPhone(raw)).toBe(out));
  it("leaves contact columns out by default and uses CRLF", () => {
    const row = { name: "Pat", source: "Call", date: "2026-03-04", phone: "+16145550100", email: "p@x.test", address: "1 St" };
    expect(buildLeadsCsv([row], false)).toBe("Name,Source,Date\r\nPat,Call,2026-03-04\r\n");
    expect(buildLeadsCsv([row], true)).toBe("Name,Source,Date,Phone,Email,Address\r\nPat,Call,2026-03-04,(614) 555-0100,p@x.test,1 St\r\n");
  });
});

describe("export route", () => {
  const contact = { name: "Pat", source: "Facebook", dateAdded: "2026-03-04T10:00:00.000Z", phone: "+16145550100", email: "secret@x.test", address: "1 St" };
  const deps = (user: unknown = owner, complete = true) => ({
    ...base(user),
    read: vi.fn(async () => ({ ok: true as const, contacts: [contact], complete, dropped: 0 })),
    readZone: vi.fn(async () => "UTC"),
  });

  it.each([
    ["another origin", owner, "https://evil.test", 403],
    ["no origin", owner, null, 403],
    ["signed out", null, ORIGIN, 401],
    ["office", { ...owner, role: "office" }, ORIGIN, 403],
    ["admin", { ...owner, role: "admin" }, ORIGIN, 403],
    ["View as client", { ...owner, viewing: true }, ORIGIN, 403],
  ])("refuses %s", async (_name, user, origin, status) => {
    const d = deps(user);
    expect((await handleLeadsExport(post({}, origin), d)).status).toBe(status);
    expect(d.read).not.toHaveBeenCalled();
  });

  it("reads the session's tenant, sends no contact fields by default, and is not cached", async () => {
    const d = deps();
    const res = await handleLeadsExport(post({ tenantId: "other" }), d);
    expect(d.read).toHaveBeenCalledWith("t1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(text).toBe("Name,Source,Date\r\nPat,Facebook,2026-03-04\r\n");
  });

  it("adds contact fields only with the checkbox, and the audit line has counts only", async () => {
    const res = await handleLeadsExport(post({ includeContact: true }), deps());
    expect(await res.text()).toContain("secret@x.test");
    const line = String(info.mock.calls[0][0]);
    expect(JSON.parse(line)).toMatchObject({ audit: "leads_export", rows: 1, contactFields: true });
    expect(line).not.toMatch(/Pat|secret|555/);
  });

  it("says when the file is not complete", async () => {
    expect((await handleLeadsExport(post({}), deps(owner, false))).headers.get("x-leads-complete")).toBe("0");
  });

  it("denies over the limit and when the limiter fails", async () => {
    const over = deps();
    over.hit.mockResolvedValue(false);
    expect((await handleLeadsExport(post({}), over)).status).toBe(429);
    const broken = deps();
    broken.hit.mockRejectedValue(new Error("db"));
    expect((await handleLeadsExport(post({}), broken)).status).toBe(429);
    expect(broken.read).not.toHaveBeenCalled();
  });
});

describe("create flag and route", () => {
  it("is off by default, has no wildcard and needs the exact tenant", () => {
    expect(isLeadsCreateEnabled("t1", {})).toBe(false);
    expect(isLeadsCreateEnabled("t1", { LEADS_CREATE_ENABLED: "true" })).toBe(false);
    expect(isLeadsCreateEnabled("t1", { LEADS_CREATE_ENABLED: "true", LEADS_CREATE_TENANTS: "*" })).toBe(false);
    expect(isLeadsCreateEnabled("t1", { LEADS_CREATE_ENABLED: "TRUE", LEADS_CREATE_TENANTS: "t1" })).toBe(false);
    expect(isLeadsCreateEnabled("t1", { LEADS_CREATE_ENABLED: "true", LEADS_CREATE_TENANTS: "t2, t1" })).toBe(true);
  });

  const valid = { name: "Pat", phone: "6145550100", source: "call" };
  const deps = (enabled = true, user: unknown = owner) => ({ ...base(user), isEnabled: vi.fn(() => enabled), create: vi.fn(async () => ({ status: "created" as const })) });

  it("answers 404 with the flag off and never calls HighLevel", async () => {
    const d = deps(false);
    expect((await handleLeadCreate(post(valid), d)).status).toBe(404);
    expect(d.create).not.toHaveBeenCalled();
  });
  it.each([["View as client", { ...owner, viewing: true }], ["admin", { ...owner, role: "admin" }]])("refuses %s", async (_n, user) => {
    const d = deps(true, user);
    expect((await handleLeadCreate(post(valid), d)).status).toBe(403);
    expect(d.create).not.toHaveBeenCalled();
  });
  it.each([[{ ...valid, source: "unknown" }], [{ ...valid, name: "" }], [{ ...valid, phone: "12" }], [{ ...valid, source: "constructor" }]])("rejects %j", async (body) => {
    const d = deps();
    expect((await handleLeadCreate(post(body), d)).status).toBe(400);
    expect(d.create).not.toHaveBeenCalled();
  });
  it("creates for the session's tenant, and the audit line holds no contact data", async () => {
    const d = deps();
    const res = await handleLeadCreate(post({ ...valid, tenantId: "other" }), d);
    expect(await res.json()).toEqual({ status: "created" });
    expect(d.create).toHaveBeenCalledWith("t1", expect.objectContaining({ name: "Pat", source: "Call" }));
    expect(String(info.mock.calls[0][0])).not.toMatch(/Pat|6145550100/);
  });
});

describe("contact create adapter (mocked HighLevel)", () => {
  const input = { name: "Pat", phone: "(614) 555-0100", email: "p@x.test", address: "1 St", source: "Call" };
  const adapter = (requests: Partial<ContactCreateRequests>) => {
    const r = {
      duplicate: vi.fn(async () => json({ contact: null })),
      create: vi.fn(async () => json({ contact: { id: "new" } }, 201)),
      search: vi.fn(async () => json({ contacts: [] })),
      ...requests,
    };
    return { r, api: createContactCreateAdapter({ readLocationId: async () => "loc", withToken: async (_t, call) => call("token"), requests: r as ContactCreateRequests }) };
  };

  it("formats E.164", () => {
    expect(toE164("(614) 555-0100")).toBe("+16145550100");
    expect(toE164("+44 20 7123 4567")).toBe("+442071234567");
    expect(toE164("5550100")).toBeNull();
  });
  it("searches phone and email first, then creates once with the documented fields", async () => {
    const { r, api } = adapter({});
    expect(await api.createContact("t", input)).toEqual({ status: "created" });
    expect(r.duplicate).toHaveBeenCalledTimes(2);
    expect(r.create).toHaveBeenCalledTimes(1);
    expect(r.create).toHaveBeenCalledWith("token", { locationId: "loc", name: "Pat", phone: "+16145550100", source: "Call", email: "p@x.test", address1: "1 St" });
  });
  it("never creates when a contact exists", async () => {
    const { r, api } = adapter({ duplicate: vi.fn(async () => json({ contact: { id: "c9" } })) });
    expect(await api.createContact("t", input)).toEqual({ status: "duplicate" });
    expect(r.create).not.toHaveBeenCalled();
  });
  it.each([[{}], [{ contact: "x" }], [[]]])("never creates on an unclear search answer %j", async (body) => {
    const { r, api } = adapter({ duplicate: vi.fn(async () => json(body)) });
    expect(await api.createContact("t", input)).toEqual({ status: "failed" });
    expect(r.create).not.toHaveBeenCalled();
  });
  it("never creates when the search fails", async () => {
    const { r, api } = adapter({ duplicate: vi.fn(async () => json({}, 500)) });
    expect(await api.createContact("t", input)).toEqual({ status: "failed" });
    expect(r.create).not.toHaveBeenCalled();
  });
  it("does not retry a lost create and reports it as unsure", async () => {
    const create = vi.fn(async () => { throw new Error("network"); });
    const { api } = adapter({ create });
    expect(await api.createContact("t", input)).toEqual({ status: "unsure" });
    expect(create).toHaveBeenCalledTimes(1);
  });

  const row = (id: string) => ({ id, dateAdded: "2026-03-04T10:00:00.000Z", firstName: "P", phone: "+16145550100", email: `${id}@x.test` });
  it("pages an export until a short page", async () => {
    const pages = [Array.from({ length: 100 }, (_, i) => row(`a${i}`)), [row("b")]];
    const search = vi.fn(async (_t: string, _l: string, page: number) => json({ contacts: pages[page - 1], total: 101 }));
    const out = await adapter({ search }).api.readForExport("t");
    expect(out).toMatchObject({ ok: true, complete: true });
    if (out.ok) expect(out.contacts).toHaveLength(101);
  });
  it("marks the export incomplete when HighLevel repeats a page", async () => {
    const same = Array.from({ length: 100 }, (_, i) => row(`a${i}`));
    const search = vi.fn(async () => json({ contacts: same, total: 500 }));
    const out = await adapter({ search }).api.readForExport("t");
    expect(out).toMatchObject({ ok: true, complete: false });
    expect(search).toHaveBeenCalledTimes(2);
  });
});

describe("address search", () => {
  const body = { input: "12 Main", sessionToken: "abcdefgh1234" };
  const deps = (over: Record<string, unknown> = {}) => ({ ...base(), apiKey: "k", search: vi.fn(async () => [{ id: "p1", text: "12 Main St" }]), ...over });

  it("is off without a key", async () => {
    const d = deps({ apiKey: " " });
    expect((await handleAddressSearch(post(body), d)).status).toBe(404);
    expect(d.search).not.toHaveBeenCalled();
  });
  it("needs a session and the same origin, and limits per tenant", async () => {
    expect((await handleAddressSearch(post(body), { ...deps(), currentUser: async () => null })).status).toBe(401);
    expect((await handleAddressSearch(post(body, "https://evil.test"), deps())).status).toBe(403);
    const d = deps();
    d.hit.mockResolvedValue(false);
    expect((await handleAddressSearch(post(body), d)).status).toBe(429);
    expect(d.hit.mock.calls[0]).toEqual(["leads-address:t1", expect.any(Number), 60_000, NOW]);
  });
  it("logs no address on failure", async () => {
    const error = vi.mocked(console.error);
    const d = deps({ search: vi.fn(async () => { throw new Error("12 Main"); }) });
    expect((await handleAddressSearch(post(body), d)).status).toBe(502);
    expect(JSON.stringify(error.mock.calls)).not.toContain("12 Main");
  });
  it("calls Places (New) with the key in a header and keeps only id and text", async () => {
    const doFetch = vi.fn(async () => json({ suggestions: [{ placePrediction: { placeId: "p1", text: { text: "12 Main St" } } }, { queryPrediction: {} }] }));
    const out = await createPlacesSearch(doFetch as unknown as typeof fetch)("key", "12 Main", "token1234");
    expect(out).toEqual([{ id: "p1", text: "12 Main St" }]);
    const [url, init] = doFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(url).not.toContain("key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("key");
  });
});
