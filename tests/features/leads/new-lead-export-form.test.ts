import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleLeadsExport } from "@/features/leads";

const ORIGIN = "https://app.test";
const NOW = new Date("2026-03-04T12:00:00.000Z");

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("export route from the page's form", () => {
  const owner = { id: "u1", role: "owner" as const, tenantId: "t1" };
  const contact = { name: "Pat", source: "Call", dateAdded: "2026-03-04T10:00:00.000Z", phone: "+16145550100", email: "p@x.test", address: "1 St" };
  const deps = (over: Record<string, unknown> = {}) => ({
    appOrigin: ORIGIN, currentUser: vi.fn(async () => owner as typeof owner | null), hit: vi.fn(async () => true), now: () => NOW,
    read: vi.fn(async () => ({ ok: true as const, contacts: [contact], complete: true, dropped: 0 })), readZone: vi.fn(async () => "UTC"), ...over,
  });
  const form = (body: string, origin = ORIGIN) => new Request(`${ORIGIN}/api/leads/export`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin }, body,
  });

  it("gives three columns with the box off", async () => {
    const res = await handleLeadsExport(form(""), deps());
    expect(res.status).toBe(200);
    expect((await res.text()).split("\r\n")[0]).toBe("Name,Source,Date");
  });
  it("adds contact fields with the box on", async () => {
    const res = await handleLeadsExport(form("includeContact=1"), deps());
    expect((await res.text()).split("\r\n")[0]).toMatch(/Phone,Email,Address/);
  });
  it("rejects any other box value without reading", async () => {
    const d = deps();
    const res = await handleLeadsExport(form("includeContact=yes"), d);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/leads?export=failed");
    expect(d.read).not.toHaveBeenCalled();
  });
  it("ignores a tenant sent in the form", async () => {
    const d = deps();
    await handleLeadsExport(form("tenantId=other&locationId=other"), d);
    expect(d.read).toHaveBeenCalledWith("t1");
  });
  it("sends the owner back with a visible reason at the limit", async () => {
    const res = await handleLeadsExport(form(""), deps({ hit: vi.fn(async () => false) }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/leads?export=busy");
  });
  it("sends the owner back when the read fails", async () => {
    const res = await handleLeadsExport(form(""), deps({ read: vi.fn(async () => ({ ok: false as const })) }));
    expect(res.headers.get("location")).toBe("/leads?export=failed");
  });
  it("keeps the same-origin check for a form", async () => {
    const d = deps();
    expect((await handleLeadsExport(form("", "https://evil.test"), d)).status).toBe(403);
    expect(d.currentUser).not.toHaveBeenCalled();
  });
  it.each([
    ["office", { ...owner, role: "office" }],
    ["admin", { ...owner, role: "admin" }],
    ["View as client", { ...owner, viewing: true }],
  ])("answers 403 to %s", async (_label, user) => {
    const d = deps({ currentUser: vi.fn(async () => user) });
    expect((await handleLeadsExport(form(""), d)).status).toBe(403);
    expect(d.read).not.toHaveBeenCalled();
  });
  it("names a partial file so a saved copy still says so", async () => {
    const d = deps({ read: vi.fn(async () => ({ ok: true as const, contacts: [contact], complete: false, dropped: 0 })) });
    const res = await handleLeadsExport(form(""), d);
    expect(res.headers.get("content-disposition")).toContain('filename="leads-partial-newest-1-2026-03-04.csv"');
    expect(res.headers.get("x-leads-complete")).toBe("0");
  });
  it("keeps the plain name for a complete file", async () => {
    const res = await handleLeadsExport(form(""), deps());
    expect(res.headers.get("content-disposition")).toContain('filename="leads-2026-03-04.csv"');
  });
});
