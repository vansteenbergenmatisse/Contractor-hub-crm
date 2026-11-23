import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInitialState, leadSearchRows, leadsReducer, loadLeads, mergeLeads, receivedLabel, sourceCounts, sourceKey, tiles,
  type Lead, type LeadContact,
} from "@/features/leads";

const NOW = new Date("2026-03-04T12:00:00.000Z");
const now = () => NOW;
const contact = (over: Partial<LeadContact> = {}): LeadContact => ({
  id: "c1", name: "Pat Test", address: "1 Test St", city: "Testville", state: "TS", postalCode: "00000", source: "Facebook", dateAdded: "2026-03-04T10:00:00.000Z", ...over,
});
const ok = (contacts: LeadContact[], extra: { dropped?: number; complete?: boolean } = {}) =>
  vi.fn(async () => ({ ok: true as const, contacts, dropped: extra.dropped ?? 0, complete: extra.complete ?? true }));
const lead = (over: Partial<Lead> = {}): Lead => ({ id: "a", name: "A", source: null, need: "", minutesWaiting: 0, address: "", status: "new", receivedAt: "2026-03-04T11:00:00.000Z", ...over });
const ctx = (complete = true) => ({ loadedAt: NOW.toISOString(), complete, timeZone: "UTC" });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("loadLeads states", () => {
  it("is ready with real rows, newest first, and no wait or status claim", async () => {
    const read = ok([contact({ id: "old", dateAdded: "2026-03-01T10:00:00.000Z" }), contact({ id: "new" })]);
    const out = await loadLeads("tenant-a", read, now);
    expect(out).toMatchObject({ state: "ready", loadedAt: NOW.toISOString(), complete: true, dropped: 0 });
    if (out.state !== "ready") throw new Error("not ready");
    expect(out.leads.map((l) => l.id)).toEqual(["new", "old"]);
    expect(out.leads[0]).toEqual({
      id: "new", name: "Pat Test", source: "fb", need: "", minutesWaiting: 0, receivedAt: "2026-03-04T10:00:00.000Z",
      address: "1 Test St, Testville, TS 00000", status: "new",
    });
  });

  it("reads only the tenant passed", async () => {
    const read = ok([contact()]);
    await loadLeads("tenant-a", read, now);
    expect(read.mock.calls).toEqual([["tenant-a"]]);
  });

  it("does not read at all without a tenant", async () => {
    const read = ok([contact()]);
    expect(await loadLeads(null, read, now)).toEqual({ state: "unavailable" });
    expect(await loadLeads(undefined, read, now)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("is empty when the sub-account has no contacts", async () => {
    expect(await loadLeads("t", ok([]), now)).toEqual({ state: "empty" });
  });

  it("does not call a list of only malformed rows empty", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadLeads("t", ok([], { dropped: 3 }), now)).toEqual({ state: "unavailable" });
  });

  it("logs a count of dropped rows and no row content", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await loadLeads("t", ok([contact()], { dropped: 2 }), now);
    expect(out).toMatchObject({ state: "ready", dropped: 2 });
    expect(warn.mock.calls.flat().join(" ")).toContain("2");
    expect(warn.mock.calls.flat().join(" ")).not.toContain("Pat");
  });

  it.each(["reconnect", "unavailable"] as const)("passes on %s", async (reason) => {
    expect(await loadLeads("t", async () => ({ ok: false, reason }), now)).toEqual({ state: reason });
  });

  it("is unavailable when the reader throws", async () => {
    expect(await loadLeads("t", async () => { throw new Error("x"); }, now)).toEqual({ state: "unavailable" });
  });

  it("the server flag turns the read off", async () => {
    vi.stubEnv("LEADS_READ_DISABLED", "true");
    const read = ok([contact()]);
    expect(await loadLeads("t", read, now)).toEqual({ state: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("names a contact without a name, and leaves an address out when there is none", async () => {
    const out = await loadLeads("t", ok([contact({ name: null, address: null, city: null, state: null, postalCode: null })]), now);
    if (out.state !== "ready") throw new Error("not ready");
    expect(out.leads[0]).toMatchObject({ name: "Unnamed lead", address: "" });
  });
});

describe("source mapping", () => {
  it.each([
    ["Facebook", "fb"], [" facebook ", "fb"], ["FB", "fb"], ["Instagram", "ig"], ["IG", "ig"], ["SMS", "text"], ["text", "text"],
    ["Call", "call"], ["phone call", "call"], ["Web Form", "form"], ["form", "form"], ["GMB", "gmb"], ["Google My Business", "gmb"],
  ])("%s is %s", (value, key) => {
    expect(sourceKey(value)).toBe(key);
  });
  it.each(["xyz form", "facebook ad", "Referral", "Google", "website", "", "constructor", "__proto__", null, undefined])("%s is unlabelled", (value) => {
    expect(sourceKey(value)).toBeNull();
  });
  it("counts an unlabelled lead in the total and in no channel, within this calendar week", () => {
    const counts = sourceCounts(
      [lead({ id: "1", source: "fb" }), lead({ id: "2", source: null }), lead({ id: "3", source: "fb", receivedAt: "2026-02-20T00:00:00.000Z" })],
      NOW.toISOString(),
      "UTC",
    );
    expect(counts.byKey.fb).toBe(1);
    expect(counts.unlabelled).toBe(1);
    expect(counts.total).toBe(2);
  });
});

describe("tiles from real rows", () => {
  const rows = [lead({ id: "1" }), lead({ id: "2", receivedAt: "2026-03-02T11:00:00.000Z" }), lead({ id: "3", receivedAt: "2026-02-01T11:00:00.000Z" })];

  it("counts today and this calendar week, and hides the wait tile with no wait data", () => {
    expect(tiles(rows, createInitialState(rows), ctx())).toEqual({ today: 1, week: 2, wait: null });
  });

  it("still counts when the page reaches past the window", () => {
    expect(tiles(rows, createInitialState(rows), ctx(false))).toEqual({ today: 1, week: 2, wait: null });
  });

  it("hides a count the page cannot prove", () => {
    const recent = [lead({ id: "1" }), lead({ id: "2", receivedAt: "2026-03-04T09:00:00.000Z" })];
    expect(tiles(recent, createInitialState(recent), ctx(false))).toEqual({ today: null, week: null, wait: null });
    const thisWeek = [lead({ id: "1" }), lead({ id: "2", receivedAt: "2026-03-02T09:00:00.000Z" })];
    expect(tiles(thisWeek, createInitialState(thisWeek), ctx(false))).toEqual({ today: 1, week: null, wait: null });
  });

  it("uses the viewer's day, not the server's", () => {
    const late = [lead({ receivedAt: "2026-03-04T02:00:00.000Z" })];
    const at = { loadedAt: "2026-03-04T12:00:00.000Z", complete: true };
    expect(tiles(late, createInitialState(late), { ...at, timeZone: "UTC" }).today).toBe(1);
    expect(tiles(late, createInitialState(late), { ...at, timeZone: "America/New_York" }).today).toBe(0);
  });
});

describe("received time", () => {
  it.each([
    ["2026-03-04T11:59:40.000Z", "Just now"],
    ["2026-03-04T11:46:00.000Z", "14 min"],
    ["2026-03-04T10:00:00.000Z", "2 hrs"],
    ["2026-03-03T10:00:00.000Z", "Yesterday"],
    ["2026-03-01T10:00:00.000Z", "Sunday"],
    ["2026-02-01T10:00:00.000Z", "Feb 1"],
  ])("%s reads %s", (at, label) => {
    expect(receivedLabel(at, NOW.toISOString(), "UTC")).toBe(label);
  });
  it("is empty for an unreadable date", () => {
    expect(receivedLabel("nope", NOW.toISOString(), "UTC")).toBe("");
  });
});

describe("kept state with fresh server rows", () => {
  const call = lead({ id: "a", status: "call", minutesWaiting: 5 });

  it("adds a new lead, so a refreshed row always has a status", () => {
    const next = mergeLeads(createInitialState([call]), [call, lead({ id: "b" })]);
    expect(next.status).toEqual({ a: "call", b: "new" });
  });

  it("keeps what the owner did while the server status is the same", () => {
    const s = leadsReducer(createInitialState([call]), { type: "call", id: "a" });
    expect(mergeLeads(s, [call]).status.a).toBe("called");
  });

  it("takes a changed server status and removes a lead that is gone", () => {
    const s = createInitialState([call, lead({ id: "gone" })]);
    const next = mergeLeads(s, [{ ...call, status: "booked" }]);
    expect(next.status).toEqual({ a: "booked" });
    expect(next.initial).toEqual({ a: "booked" });
  });

  it("answers the same object when nothing changed", () => {
    const s = createInitialState([call]);
    expect(mergeLeads(s, [call])).toBe(s);
    expect(leadsReducer(s, { type: "sync", leads: [call] })).toBe(s);
  });

  it("a real contact cannot be marked called or booked", () => {
    const s = createInitialState([lead()]);
    expect(leadsReducer(s, { type: "call", id: "a" })).toBe(s);
    expect(leadsReducer(s, { type: "book", id: "a" })).toBe(s);
  });
});

describe("search rows from real leads", () => {
  it("publishes id, name and subtitle, and no phone or email", () => {
    const rows = leadSearchRows([lead({ id: "c9", name: "Pat Test", source: "fb", received: "2 hrs" }), lead({ id: "c8", name: "Sam", received: "Yesterday" })]);
    expect(rows).toEqual([
      { id: "c9", page: "leads", name: "Pat Test", sub: "Facebook · 2 hrs", href: "/leads" },
      { id: "c8", page: "leads", name: "Sam", sub: "Yesterday", href: "/leads" },
    ]);
  });
});
