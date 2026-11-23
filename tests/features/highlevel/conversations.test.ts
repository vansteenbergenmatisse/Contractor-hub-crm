import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HighLevelHttpError, INBOX_CONVERSATIONS_LIMIT, INBOX_READS_PER_MINUTE, MAX_INBOX_RESPONSE_BYTES, TokenServiceError,
  buildInboxReader, parseConversationSearch, parseConversationMessages, readInboxConversations, readInboxThread,
  requestConversationMessages, requestConversationSearch,
} from "@/features/highlevel";

// Fixtures follow the official OpenAPI file (hl-api-notes.md); the live response is unverified. All values are fake.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const convo = (over: Record<string, unknown> = {}) => ({
  id: "conv-1", contactId: "contact-1", locationId: "loc-a", lastMessageBody: "Hello", lastMessageType: "TYPE_SMS", type: "TYPE_PHONE",
  unreadCount: 2, fullName: "Pat Full", contactName: "Pat Test", email: "pat@example.test", phone: "+15550100", ...over,
});
const message = (over: Record<string, unknown> = {}) => ({
  id: "m1", type: 2, messageType: "TYPE_SMS", locationId: "loc-a", contactId: "contact-1", conversationId: "conv-1",
  dateAdded: "2026-03-04T10:00:00.000Z", body: "Hi", direction: "inbound", contentType: "text/plain", ...over,
});

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errorLog.mockRestore());

const deps = (response: Response) => ({
  readLocationId: vi.fn(async () => "loc-a" as string | null),
  withToken: vi.fn(async (_tenant: string, call: (token: string) => Promise<Response>) => call("tok")),
  requestConversations: vi.fn(async () => response),
  requestMessages: vi.fn(async () => response),
});

describe("requests", () => {
  it("GETs one page of the location's newest conversations", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ conversations: [], total: 0 }));
    await requestConversationSearch({ baseUrl: "https://hl.example.test/", fetch }, "tok", "loc a", 25);
    const [url, init] = fetch.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/conversations/search");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ locationId: "loc a", limit: "25", sort: "desc", sortBy: "last_message_date" });
    expect(init.method).toBe("GET");
    expect(init.headers).toMatchObject({ authorization: "Bearer tok", version: "2021-04-15" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("GETs the messages with the conversation id encoded into the path", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ messages: [] }));
    await requestConversationMessages({ baseUrl: "https://hl.example.test", fetch }, "tok", "a/b", 10);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://hl.example.test/conversations/a%2Fb/messages?limit=10");
    expect(init.method).toBe("GET");
  });

  it("turns a network failure into an error with no status and no detail", async () => {
    const fetch = vi.fn().mockRejectedValue(new Error("secret detail"));
    const error = await requestConversationSearch({ baseUrl: "https://hl.example.test", fetch }, "tok", "loc-a", 5).catch((e) => e);
    expect(error).toBeInstanceOf(HighLevelHttpError);
    expect(error.status).toBeNull();
    expect(error.message).not.toContain("secret");
  });
});

describe("parseConversationSearch", () => {
  it("keeps the known fields and never carries phone or email", () => {
    const page = parseConversationSearch({ conversations: [convo()], total: 1 }, "loc-a", 50);
    expect(page).toEqual({
      conversations: [{ id: "conv-1", name: "Pat Test", lastMessageBody: "Hello", lastMessageType: "TYPE_SMS", unreadCount: 2 }],
      dropped: 0,
      complete: true,
    });
    expect(JSON.stringify(page)).not.toMatch(/5550100|example\.test/);
  });

  it("drops and counts malformed rows, duplicates and rows of another location", () => {
    const page = parseConversationSearch({ conversations: [convo(), convo(), convo({ id: "x", locationId: "loc-b" }), { nope: 1 }, "bad"], total: 5 }, "loc-a", 50);
    expect(page.conversations).toHaveLength(1);
    expect(page.dropped).toBe(4);
  });

  it("reads a wrong type in an optional field as missing", () => {
    const row = parseConversationSearch({ conversations: [convo({ contactName: 7, fullName: "  ", lastMessageBody: {}, unreadCount: -1 })] }, "loc-a", 50).conversations[0];
    expect(row).toMatchObject({ name: null, lastMessageBody: null, unreadCount: 0 });
  });

  it("reports an incomplete page and caps the rows", () => {
    const page = parseConversationSearch({ conversations: [convo({ id: "a" }), convo({ id: "b" }), convo({ id: "c" })], total: 9 }, "loc-a", 2);
    expect(page.conversations).toHaveLength(2);
    expect(page.complete).toBe(false);
  });

  it("throws on an answer with no list", () => {
    expect(() => parseConversationSearch({ data: [] }, "loc-a", 50)).toThrow();
  });
});

describe("parseConversationMessages", () => {
  it("reads both documented nestings", () => {
    const top = parseConversationMessages({ messages: [message()], nextPage: false, lastMessageId: "m1" }, "loc-a", "conv-1", 50);
    const nested = parseConversationMessages({ messages: { messages: [message()], nextPage: false, lastMessageId: "m1" } }, "loc-a", "conv-1", 50);
    expect(top).toEqual(nested);
    expect(top).toEqual({ messages: [{ id: "m1", direction: "inbound", body: "Hi", dateAdded: "2026-03-04T10:00:00.000Z", messageType: "TYPE_SMS" }], dropped: 0, complete: true });
  });

  it("drops rows of another conversation or location, a bad date and a bad direction", () => {
    const page = parseConversationMessages({ messages: [message({ id: "a", conversationId: "other" }), message({ id: "b", locationId: "loc-b" }), message({ id: "c", dateAdded: "nope" }), message({ id: "d", direction: "sideways" })], nextPage: false }, "loc-a", "conv-1", 50);
    expect(page.messages).toEqual([]);
    expect(page.dropped).toBe(4);
  });

  it("leaves out activity lines and internal comments without counting them as malformed", () => {
    const page = parseConversationMessages({ messages: [message({ id: "a", messageType: "TYPE_ACTIVITY_CONTACT" }), message({ id: "b", messageType: "TYPE_INTERNAL_COMMENT" }), message({ id: "c" })], nextPage: false }, "loc-a", "conv-1", 50);
    expect(page.messages.map((m) => m.id)).toEqual(["c"]);
    expect(page.dropped).toBe(0);
  });

  it("treats nextPage true as incomplete", () => {
    expect(parseConversationMessages({ messages: [message()], nextPage: true }, "loc-a", "conv-1", 50).complete).toBe(false);
  });
});

describe("reads", () => {
  it("answers reconnect when the tenant has no location, without a call", async () => {
    const d = deps(json({ conversations: [] }));
    d.readLocationId.mockResolvedValue(null);
    expect(await readInboxConversations(d, "t1")).toEqual({ ok: false, reason: "reconnect" });
    expect(d.withToken).not.toHaveBeenCalled();
  });

  it.each([[401, "reconnect"], [403, "reconnect"], [429, "unavailable"], [500, "unavailable"]])("maps status %i to %s with one attempt", async (status, reason) => {
    const d = deps(json({ message: "customer detail" }, status));
    expect(await readInboxConversations(d, "t1")).toEqual({ ok: false, reason });
    expect(d.requestConversations).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("customer detail");
  });

  it("maps token errors", async () => {
    const d = deps(json({}));
    d.withToken.mockRejectedValue(new TokenServiceError("unavailable"));
    expect(await readInboxThread(d, "t1", "conv-1")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("refuses an oversized body", async () => {
    const d = deps(new Response("{}", { headers: { "content-length": String(MAX_INBOX_RESPONSE_BYTES + 1) } }));
    expect(await readInboxConversations(d, "t1")).toEqual({ ok: false, reason: "unavailable" });
  });

  it("never logs message content on a parse failure", async () => {
    const d = deps(new Response("not json: private text"));
    await readInboxThread(d, "t1", "conv-1");
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("private text");
  });

  it("uses the requested default page size", async () => {
    const d = deps(json({ conversations: [], total: 0 }));
    await readInboxConversations(d, "t1");
    expect(d.requestConversations).toHaveBeenCalledWith("tok", "loc-a", INBOX_CONVERSATIONS_LIMIT);
  });
});

describe("buildInboxReader", () => {
  const base = () => {
    const response = () => json({ conversations: [], total: 0 });
    return {
      hit: vi.fn(async () => true),
      now: () => new Date("2026-03-04T10:00:00.000Z"),
      readLocationId: vi.fn(async () => "loc-a" as string | null),
      withLocationToken: vi.fn(async (_t: string, call: (token: string) => Promise<Response>) => call("fresh")),
      withStoredLocationToken: vi.fn(async (_t: string, call: (token: string) => Promise<Response>) => call("stored")),
      requestConversations: vi.fn(async () => response()),
      requestMessages: vi.fn(async () => json({ messages: [], nextPage: false })),
    };
  };

  it("counts a normal read per tenant and uses the refreshing token path", async () => {
    const d = base();
    await buildInboxReader(d).list("t1");
    expect(d.hit).toHaveBeenCalledWith("highlevel-inbox:t1", INBOX_READS_PER_MINUTE, 60_000, expect.any(Date));
    expect(d.withLocationToken).toHaveBeenCalledTimes(1);
    expect(d.withStoredLocationToken).not.toHaveBeenCalled();
  });

  it("a viewer never calls withLocationToken and is counted on the viewer's own key", async () => {
    const d = base();
    const reader = buildInboxReader(d, { viewerId: "admin-1" });
    await reader.list("t1");
    await reader.thread("t1", "conv-1");
    expect(d.withLocationToken).not.toHaveBeenCalled();
    expect(d.withStoredLocationToken).toHaveBeenCalledTimes(2);
    expect(d.hit).toHaveBeenCalledTimes(2);
    for (const call of d.hit.mock.calls as unknown as [string][]) expect(call[0]).toBe("highlevel-inbox-view:admin-1");
  });

  it("a viewer with no usable stored token gets unavailable", async () => {
    const d = base();
    d.withStoredLocationToken.mockRejectedValue(new TokenServiceError("unavailable"));
    expect(await buildInboxReader(d, { viewerId: "admin-1" }).list("t1")).toEqual({ ok: false, reason: "unavailable" });
    expect(d.withLocationToken).not.toHaveBeenCalled();
  });

  it("over the limit, or with a broken limiter, makes no token or HighLevel call", async () => {
    for (const hit of [vi.fn(async () => false), vi.fn(async () => { throw new Error("db"); })]) {
      const d = { ...base(), hit };
      expect(await buildInboxReader(d).list("t1")).toEqual({ ok: false, reason: "unavailable" });
      expect(d.withLocationToken).not.toHaveBeenCalled();
      expect(d.requestConversations).not.toHaveBeenCalled();
    }
  });
});
