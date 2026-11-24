import { describe, expect, it, vi } from "vitest";
import { handleLeadsExport } from "@/features/leads";

const ORIGIN = "https://app.example.test";
const deps = () => ({
  appOrigin: ORIGIN,
  currentUser: vi.fn(async () => ({ id: "u", role: "office" as const, tenantId: "t1" })),
  hit: vi.fn(async () => true),
  now: () => new Date("2026-03-04T12:00:00.000Z"),
  read: vi.fn(),
  readZone: vi.fn(),
});
const post = (body: string, origin = ORIGIN) => new Request(`${ORIGIN}/api/leads/export`, {
  method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body,
});

describe("a refused export from the page's form", () => {
  it("goes back to Leads with the reason, so HighLevel's iframe shows a page", async () => {
    const d = deps();
    const res = await handleLeadsExport(post("from=leads"), d);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/leads?export=forbidden");
    expect(d.read).not.toHaveBeenCalled();
  });
  it("still refuses another site without a redirect", async () => {
    const d = deps();
    const res = await handleLeadsExport(post("from=leads", "https://evil.test"), d);
    expect(res.status).toBe(403);
    expect(d.currentUser).not.toHaveBeenCalled();
  });
});
