import { describe, expect, it, vi } from "vitest";
import { buildLeadsCsv, csvCell, exportFailure, handleLeadsExport } from "@/features/leads";

const ORIGIN = "https://app.example.test";
const owner = { id: "u1", role: "owner" as const, tenantId: "t1" };
const contact = { name: "Pat", source: "Call", dateAdded: "2026-03-04T10:00:00.000Z", phone: "+16145550100", email: "p@x.test", address: "1 St" };
const deps = (over: Record<string, unknown> = {}) => ({
  appOrigin: ORIGIN, currentUser: vi.fn(async () => owner as typeof owner | null), hit: vi.fn(async () => true), now: () => new Date("2026-03-04T12:00:00.000Z"),
  read: vi.fn(async () => ({ ok: true as const, contacts: [contact], complete: true, dropped: 0 })), readZone: vi.fn(async () => "UTC"), ...over,
});
const framed = (origin = ORIGIN) => new Request(`${ORIGIN}/api/leads/export?respond=stay`, {
  method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: "includeContact=1",
});
const resultOf = (res: Response) => /^leads-export-result=([a-z]+)\./.exec(res.headers.get("set-cookie") ?? "")?.[1];

function split(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) { cells.push(cell); cell = ""; }
    else cell += ch;
  }
  cells.push(cell);
  return cells;
}

describe("CSV guard with a quote between delimiter and trigger", () => {
  const tails = [';"=1+1', ';"+1', ';"-1', ';"@x', '\t"=1+1', '\r\n"=1+1', '; "=1+1', ';""=1+1', ";'=1+1"];
  describe.each(["phone", "email", "address"] as const)("%s", (column) => {
    it.each(tails)("no cell runs as a formula for a%j", (tail) => {
      const row = { name: "Pat", source: "Call", date: "2026-03-04", phone: "1", email: "e", address: "s", [column]: `a${tail}` };
      const line = buildLeadsCsv([row], true).split("\r\n").slice(1).join("\r\n");
      for (const delimiter of [";", "\t", ","]) {
        for (const physical of line.split(/\r\n|\n/)) {
          for (const cell of split(physical, delimiter)) expect(cell.replace(/^[\s"]+/, "")).not.toMatch(/^[=+\-@]/);
        }
      }
    });
  });
  it("guards a value that opens with a quote", () => {
    expect(csvCell('"=1+1')).toBe(`"'""=1+1"`);
  });
  it("keeps quoted benign text readable", () => {
    expect(csvCell('Pat "P" Lee')).toBe('"Pat ""P"" Lee"');
  });
});

describe("the stay-on-page export answer", () => {
  it("still sends the file, and marks it done", async () => {
    const res = await handleLeadsExport(framed(), deps());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("leads-2026-03-04.csv");
    expect(resultOf(res)).toBe("ok");
    expect(await res.text()).toContain("Pat");
  });
  it("holds no lead data in the cookie", async () => {
    const cookie = (await handleLeadsExport(framed(), deps())).headers.get("set-cookie")!;
    expect(cookie).not.toMatch(/\bPat\b|p@x\.test|6145550100/);
    expect(cookie).toContain("SameSite=None");
    expect(cookie).toContain("Secure");
  });
  it.each([
    ["busy", { hit: vi.fn(async () => false) }],
    ["failed", { read: vi.fn(async () => ({ ok: false as const })) }],
    ["failed", { currentUser: vi.fn(async () => { throw new Error("x"); }) }],
    ["forbidden", { currentUser: vi.fn(async () => ({ ...owner, role: "office" as const })) }],
  ])("answers %s with 204 so the page stays", async (reason, over) => {
    const res = await handleLeadsExport(framed(), deps(over));
    expect(res.status).toBe(204);
    expect(res.headers.get("location")).toBeNull();
    expect(resultOf(res)).toBe(reason);
  });
  it("sets nothing for a bad Origin", async () => {
    const res = await handleLeadsExport(framed("https://evil.test"), deps());
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
  it("answers a failure before the handler ran", () => {
    const res = exportFailure(framed());
    expect(res.status).toBe(204);
    expect(resultOf(res)).toBe("failed");
  });
});
