import { describe, expect, it, vi } from "vitest";
import { handleLeadsExport } from "@/features/leads";

const ORIGIN = "https://app.example.test";
const owner = { id: "u1", role: "owner" as const, tenantId: "t1" };
const contact = { name: "Pat", source: "Call", dateAdded: "2026-03-04T10:00:00.000Z", phone: "+16145550100", email: "p@x.test", address: "=1+1" };
const deps = (over: Record<string, unknown> = {}) => ({
  appOrigin: ORIGIN,
  currentUser: vi.fn(async () => owner as unknown),
  hit: vi.fn(async () => true),
  now: () => new Date("2026-03-04T12:00:00.000Z"),
  read: vi.fn(async () => ({ ok: true as const, contacts: [contact], complete: true, dropped: 0 })),
  readZone: vi.fn(async () => "UTC"),
  ...over,
}) as unknown as Parameters<typeof handleLeadsExport>[1];
const post = (origin = ORIGIN) => new Request(`${ORIGIN}/api/leads/export`, {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ includeContact: true }),
});

describe("the export the panel fetches", () => {
  it("gives the owner the file with formula protection", async () => {
    const d = deps();
    const res = await handleLeadsExport(post(), d);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("leads-2026-03-04.csv");
    expect(await res.text()).toContain("'=1+1");
    expect(d.read).toHaveBeenCalledWith("t1");
  });
  it.each([
    ["office", { ...owner, role: "office" }],
    ["view as client", { ...owner, role: "admin", viewing: true }],
    ["an owner marked as viewing", { ...owner, viewing: true }],
    ["no tenant", { ...owner, tenantId: null }],
  ])("refuses %s with a 403 and reads nothing", async (_who, user) => {
    const d = deps({ currentUser: vi.fn(async () => user) });
    const res = await handleLeadsExport(post(), d);
    expect(res.status).toBe(403);
    expect(res.headers.get("location")).toBeNull();
    expect(d.read).not.toHaveBeenCalled();
  });
  it("refuses another site", async () => {
    const d = deps();
    const res = await handleLeadsExport(post("https://evil.test"), d);
    expect(res.status).toBe(403);
    expect(d.currentUser).not.toHaveBeenCalled();
    expect(d.read).not.toHaveBeenCalled();
  });
  it("answers the limit with a 429 and no redirect", async () => {
    const res = await handleLeadsExport(post(), deps({ hit: vi.fn(async () => false) }));
    expect(res.status).toBe(429);
    expect(res.headers.get("location")).toBeNull();
  });
  it("answers a thrown failure with a 500 and no redirect", async () => {
    const res = await handleLeadsExport(post(), deps({ currentUser: vi.fn(async () => { throw new Error("x"); }) }));
    expect(res.status).toBe(500);
    expect(res.headers.get("location")).toBeNull();
  });
});
