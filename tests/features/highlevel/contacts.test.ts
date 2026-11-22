import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTACTS_PAGE_SIZE, CONTACTS_READS_PER_MINUTE, HighLevelHttpError, MAX_CONTACTS_RESPONSE_BYTES, TokenServiceError, createHighLevelClient,
  createTenantContactsReader, parseContactSearch, readContactsPage, readContactsThrottled,
} from "@/features/highlevel";

// Documented shape (hl-api-notes.md). All values are fake.
const config = { baseUrl: "https://hl.example.test/", appId: "a", clientId: "c", clientSecret: "s", redirectUri: "https://x.test/cb" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const row = (over: Record<string, unknown> = {}) => ({ id: "c1", locationId: "loc-a", contactName: "Pat Test", source: "Facebook", dateAdded: "2026-03-04T10:00:00.000Z", ...over });

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorLog.mockRestore());

describe("requestContactSearch", () => {
  it("POSTs one page of the newest contacts for the location, with the bearer token and a Version", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ contacts: [] }));
    await createHighLevelClient({ ...config, fetch }).requestContactSearch("tok", "loc-a", 25);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://hl.example.test/contacts/search");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ authorization: "Bearer tok", version: "v3", "content-type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ locationId: "loc-a", page: 1, pageLimit: 25, sort: [{ field: "dateAdded", direction: "desc" }] });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("turns a network failure into an error with no status", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("secret detail"));
    const error = await createHighLevelClient({ ...config, fetch }).requestContactSearch("tok", "loc-a", 25).catch((e) => e);
    expect(error).toBeInstanceOf(HighLevelHttpError);
    expect(error.status).toBeNull();
    expect(error.message).not.toContain("secret");
  });
});

describe("parseContactSearch", () => {
  it("keeps the known fields, ignores unknown ones and never carries phone or email", () => {
    const page = parseContactSearch({ contacts: [row({ phone: "+15550100", email: "p@example.test", address: "1 Test St", city: "Testville", state: "TS", postalCode: "00000", extra: { a: 1 } })], total: 1 }, "loc-a", 100);
    expect(page).toEqual({
      contacts: [{ id: "c1", name: "Pat Test", address: "1 Test St", city: "Testville", state: "TS", postalCode: "00000", source: "Facebook", dateAdded: "2026-03-04T10:00:00.000Z" }],
      dropped: 0,
      complete: true,
    });
    expect(JSON.stringify(page)).not.toMatch(/5550100|example\.test/);
  });

  it("falls back to first and last name, then to no name", () => {
    const page = parseContactSearch({ contacts: [row({ id: "a", contactName: undefined, firstName: "Ann", lastName: "Lee" }), row({ id: "b", contactName: "  " })] }, "loc-a", 100);
    expect(page.contacts.map((c) => c.name)).toEqual(["Ann Lee", null]);
  });

  it("reads a wrong type in an optional field as missing", () => {
    expect(parseContactSearch({ contacts: [row({ source: 7, address: { line: "x" } })] }, "loc-a", 100).contacts[0]).toMatchObject({ source: null, address: null });
  });

  it("drops and counts malformed rows, duplicates and rows of another location", () => {
    const page = parseContactSearch({
      contacts: [row(), null, "x", [], row({ id: "" }), row({ id: 5 }), row({ id: "d", dateAdded: "not a date" }), row({ id: "e", dateAdded: undefined }), row({ id: "f", locationId: "loc-b" }), row()],
    }, "loc-a", 100);
    expect(page.contacts.map((c) => c.id)).toEqual(["c1"]);
    expect(page.dropped).toBe(9);
  });

  it.each([[null], [[]], ["x"], [{}], [{ contacts: "no" }]])("throws on an answer without a contacts list: %j", (body) => {
    expect(() => parseContactSearch(body, "loc-a", 100)).toThrow(/unexpected/);
  });

  it.each([
    ["total above the rows", { total: 3 }, 1, false],
    ["total equal to the rows", { total: 1 }, 1, true],
    ["count above the rows", { count: 9 }, 1, false],
    ["hasMore true", { hasMore: true }, 1, false],
    ["hasMore false", { hasMore: false }, 2, true],
    ["no paging info, short page", {}, 1, true],
    ["no paging info, full page", {}, 2, false],
  ])("paging: %s", (_name, paging, rows, complete) => {
    const contacts = Array.from({ length: rows }, (_, i) => row({ id: `c${i}` }));
    expect(parseContactSearch({ contacts, ...paging }, "loc-a", 2).complete).toBe(complete);
  });
});

describe("readContactsPage", () => {
  const deps = (response: () => Promise<Response>, locationId: string | null = "loc-a") => ({
    readLocationId: vi.fn(async () => locationId),
    withLocationToken: vi.fn(async (_tenant: string, call: (token: string) => Promise<Response>) => call("tok")),
    requestContactSearch: vi.fn(response),
  });

  it("reads only the tenant it was given, with that tenant's location", async () => {
    const d = deps(async () => json({ contacts: [row()], total: 1 }));
    const out = await readContactsPage(d, "tenant-a");
    expect(out).toMatchObject({ ok: true, dropped: 0, complete: true });
    expect(d.readLocationId.mock.calls).toEqual([["tenant-a"]]);
    expect(d.withLocationToken.mock.calls.map((c) => c[0])).toEqual(["tenant-a"]);
    expect(d.requestContactSearch.mock.calls).toEqual([["tok", "loc-a", CONTACTS_PAGE_SIZE]]);
  });

  it("asks for reconnect when the tenant has no location, without calling HighLevel", async () => {
    const d = deps(async () => json({ contacts: [] }), null);
    expect(await readContactsPage(d, "t")).toEqual({ ok: false, reason: "reconnect" });
    expect(d.requestContactSearch).not.toHaveBeenCalled();
  });

  it.each([
    ["not_connected", "reconnect"],
    ["needs_reconnect", "reconnect"],
    ["agency_unavailable", "reconnect"],
    ["unavailable", "unavailable"],
  ] as const)("token error %s becomes %s", async (code, reason) => {
    const d = deps(async () => json({ contacts: [] }));
    d.withLocationToken.mockRejectedValue(new TokenServiceError(code));
    expect(await readContactsPage(d, "t")).toEqual({ ok: false, reason });
  });

  it.each([[401, "reconnect"], [403, "reconnect"], [400, "unavailable"], [404, "unavailable"], [422, "unavailable"], [429, "unavailable"], [500, "unavailable"], [503, "unavailable"]])("HTTP %i becomes %s, in one request", async (status, reason) => {
    const d = deps(async () => json({ message: "Pat Test secret" }, status));
    expect(await readContactsPage(d, "t")).toEqual({ ok: false, reason });
    expect(d.requestContactSearch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("Pat Test");
  });

  it("a network failure or an unreadable answer is unavailable", async () => {
    const down = deps(async () => {
      throw new HighLevelHttpError("x", null);
    });
    expect(await readContactsPage(down, "t")).toEqual({ ok: false, reason: "unavailable" });
    const garbled = deps(async () => new Response("<html>", { status: 200 }));
    expect(await readContactsPage(garbled, "t")).toEqual({ ok: false, reason: "unavailable" });
    const noList = deps(async () => json({ nope: 1 }));
    expect(await readContactsPage(noList, "t")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("never returns more rows than the page limit, and says the list is cut off", async () => {
    const rows = [1, 2, 3, 4].map((n) => row({ id: `c${n}` }));
    const out = await readContactsPage(deps(async () => json({ contacts: rows, total: 4 })), "t", 2);
    expect(out).toMatchObject({ ok: true, dropped: 0, complete: false });
    expect(out.ok && out.contacts.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("rejects a declared oversized body without reading it", async () => {
    const cancel = vi.fn();
    const pull = vi.fn();
    const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    const headers = { "content-length": String(MAX_CONTACTS_RESPONSE_BYTES + 1) };
    const out = await readContactsPage(deps(async () => new Response(body, { status: 200, headers })), "t");
    expect(out).toEqual({ ok: false, reason: "unavailable" });
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  it("stops reading an undeclared body at the limit", async () => {
    const chunk = new Uint8Array(Math.ceil(MAX_CONTACTS_RESPONSE_BYTES / 2)).fill(32);
    let sent = 0;
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(chunk);
      },
      cancel,
    }, { highWaterMark: 0 });
    const out = await readContactsPage(deps(async () => new Response(body, { status: 200 })), "t");
    expect(out).toEqual({ ok: false, reason: "unavailable" });
    expect(sent).toBeLessThanOrEqual(3);
    expect(cancel).toHaveBeenCalled();
  });

  it("still reads a body of exactly the limit", async () => {
    const text = JSON.stringify({ contacts: [row()], total: 1 });
    const padded = text.padEnd(MAX_CONTACTS_RESPONSE_BYTES, " ");
    const out = await readContactsPage(deps(async () => new Response(padded, { status: 200 })), "t");
    expect(out).toMatchObject({ ok: true, complete: true });
  });
});

describe("readContactsThrottled", () => {
  const NOW = new Date("2026-03-04T12:00:00.000Z");

  it("counts per tenant, 60 reads a minute, before reading", async () => {
    const order: string[] = [];
    const hit = vi.fn(async () => {
      order.push("hit");
      return true;
    });
    const read = vi.fn(async () => {
      order.push("read");
      return { ok: true as const, contacts: [], dropped: 0, complete: true };
    });
    await readContactsThrottled({ hit, read, now: () => NOW }, "tenant-a");
    expect(CONTACTS_READS_PER_MINUTE).toBe(60);
    expect(hit).toHaveBeenCalledWith("highlevel-contacts:tenant-a", 60, 60_000, NOW);
    expect(read).toHaveBeenCalledWith("tenant-a");
    expect(order).toEqual(["hit", "read"]);
  });

  it("over the limit is unavailable and never reads", async () => {
    const read = vi.fn();
    const out = await readContactsThrottled({ hit: async () => false, read, now: () => NOW }, "t");
    expect(out).toEqual({ ok: false, reason: "unavailable" });
    expect(read).not.toHaveBeenCalled();
  });

  it("a limiter failure denies the read (fail closed) and does not throw or log its detail", async () => {
    const read = vi.fn();
    const hit = async () => {
      throw new Error("db secret detail");
    };
    expect(await readContactsThrottled({ hit, read, now: () => NOW }, "t")).toEqual({ ok: false, reason: "unavailable" });
    expect(read).not.toHaveBeenCalled();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("secret");
  });

  it("the tenant reader stops at the limiter, before env, token or HighLevel", async () => {
    const hit = vi.fn(async () => false);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await createTenantContactsReader(hit)("tenant-a")).toEqual({ ok: false, reason: "unavailable" });
    expect(hit).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
