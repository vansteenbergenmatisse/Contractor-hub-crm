import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createContactCreateAdapter, type ContactCreateRequests } from "@/features/highlevel";
import { buildLeadsCsv, csvCell, exportFailure, handleLeadsExport } from "@/features/leads";

const ORIGIN = "https://app.test";
const NOW = new Date("2026-03-04T12:00:00.000Z");
const DATE = "2026-03-04T10:00:00.000Z";

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const readRows = (rows: unknown[]) => {
  const requests: ContactCreateRequests = {
    duplicate: vi.fn(), create: vi.fn(),
    search: vi.fn(async () => new Response(JSON.stringify({ contacts: rows, total: rows.length }), { status: 200 })),
  };
  return createContactCreateAdapter({ readLocationId: async () => "LOC_A", withToken: async (_t, call) => call("token"), requests }).readForExport("t", "own@a.example");
};
const valid = { id: "X", locationId: "LOC_A", dateAdded: DATE, contactName: "Real Lead", phone: "+15550000001", email: "real@a.example" };
const foreign = { id: "X", locationId: "LOC_B", dateAdded: DATE, contactName: "Other", phone: "+15559999999", email: "foreign@b.example" };

describe("export keeps to one location", () => {
  it("takes phone and email from the row in this location", async () => {
    const out = await readRows([valid]);
    expect(out).toMatchObject({ ok: true, contacts: [{ name: "Real Lead", phone: "+15550000001", email: "real@a.example" }] });
  });
  it.each([["before", [foreign, valid]], ["after", [valid, foreign]]])("fails with no file when a foreign row sharing the id comes %s", async (_at, rows) => {
    const out = await readRows(rows);
    expect(out).toEqual({ ok: false });
    expect(JSON.stringify(out)).not.toContain("foreign@b.example");
  });
  it("fails when a foreign row has its own id", async () => {
    expect(await readRows([valid, { ...foreign, id: "Y" }])).toEqual({ ok: false });
  });
  it("does not take values from the business's own contact sharing an id", async () => {
    const own = { ...valid, email: "own@a.example", phone: "+15558888888" };
    const out = await readRows([own, valid]);
    expect(out).toMatchObject({ ok: true, contacts: [{ phone: "+15550000001", email: "real@a.example" }] });
    expect(JSON.stringify(out)).not.toContain("+15558888888");
  });
  it("does not take values from a row past the page limit", async () => {
    const filler = Array.from({ length: 99 }, (_, i) => ({ id: `f${i}`, locationId: "LOC_A", dateAdded: DATE, contactName: "F" }));
    const out = await readRows([valid, ...filler, { ...valid, phone: "+15557777777", email: "late@a.example" }]);
    expect(JSON.stringify(out)).not.toContain("+15557777777");
    expect(JSON.stringify(out)).not.toContain("late@a.example");
  });
});

// RFC 4180 reader, used to prove the file round-trips.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i += 1; }
    else cell += ch;
  }
  return rows;
}

describe("CSV formula guard after a delimiter", () => {
  const attacks = [";=1+1", ";+1", ";-1", ";@x", "\t=1+1", "\r\n=1+1", "; =1+1"].map((tail) => `a${tail}`);

  it.each(attacks)("leaves no cell starting a formula in %j under any delimiter", (value) => {
    const out = csvCell(value);
    expect(out.startsWith('"')).toBe(true);
    const inner = out.slice(1, -1);
    for (const piece of inner.split(/[;\t\r\n]/)) expect(piece.trimStart()).not.toMatch(/^[=+\-@]/);
  });
  it.each(["name", "email", "phone", "address"] as const)("guards the %s column", (column) => {
    const row = { name: "Pat", source: "Call", date: "2026-03-04", phone: "1", email: "e", address: "s", [column]: "a;=HYPERLINK(1)" };
    const csv = buildLeadsCsv([row], true);
    expect(csv).toContain(";'=HYPERLINK(1)");
    expect(csv).not.toContain(";=HYPERLINK");
  });
  it("round-trips benign text through an RFC 4180 reader", () => {
    const row = { name: 'Pat "P"; Lee', source: "Call", date: "2026-03-04", phone: "1", email: "a,b", address: "1 St\r\n2nd" };
    expect(parseCsv(buildLeadsCsv([row], true))[1]).toEqual(['Pat "P"; Lee', "Call", "2026-03-04", "1", "a,b", "1 St\r\n2nd"]);
  });
  it.each(["Mary-Jane O'Neil", "Anne-Marie Smith", "12-14 Oak St"])("keeps %j as written", (value) => {
    expect(csvCell(value)).toBe(value);
  });
});

describe("form failures stay usable", () => {
  const owner = { id: "u1", role: "owner" as const, tenantId: "t1" };
  const deps = (over: Record<string, unknown> = {}) => ({
    appOrigin: ORIGIN, currentUser: vi.fn(async () => owner as typeof owner | null), hit: vi.fn(async () => true), now: () => NOW,
    read: vi.fn(async () => ({ ok: true as const, contacts: [], complete: true, dropped: 0 })), readZone: vi.fn(async () => "UTC"), ...over,
  });
  const form = (origin = ORIGIN) => new Request(`${ORIGIN}/api/leads/export`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin }, body: "" });
  const jsonPost = () => new Request(`${ORIGIN}/api/leads/export`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: "{}" });
  const throwing = () => vi.fn(async () => { throw new Error("db"); });

  it("redirects a form when the session check throws", async () => {
    const res = await handleLeadsExport(form(), deps({ currentUser: throwing() }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/leads?export=failed");
  });
  it("answers JSON when the session check throws on a JSON call", async () => {
    const res = await handleLeadsExport(jsonPost(), deps({ currentUser: throwing() }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "failed" });
  });
  it("gives a form with a bad Origin a page with a way back", async () => {
    const res = await handleLeadsExport(form("https://evil.test"), deps());
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain('href="/leads"');
  });
  it("gives a form without owner access a page with a way back", async () => {
    const res = await handleLeadsExport(form(), deps({ currentUser: vi.fn(async () => ({ ...owner, role: "office" as const })) }));
    expect(res.status).toBe(403);
    expect(await res.text()).toContain('href="/leads"');
  });
  it("exportFailure redirects a form and answers JSON otherwise", () => {
    expect(exportFailure(form()).headers.get("location")).toBe("/leads?export=failed");
    expect(exportFailure(jsonPost()).status).toBe(500);
  });
});
