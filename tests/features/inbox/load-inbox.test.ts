import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { channelOfType, loadInbox } from "@/features/inbox";
import type { InboxReader } from "@/features/inbox";

// All values are fake.
const row = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Pat ${id}`, lastMessageBody: "Hello", lastMessageType: "TYPE_SMS", unreadCount: 0, ...over });
const msg = (id: string, dateAdded: string, direction: "inbound" | "outbound" = "inbound") => ({ id, direction, body: id, dateAdded, messageType: "TYPE_SMS" });
const reader = (over: Partial<InboxReader> = {}): InboxReader => ({
  list: vi.fn(async () => ({ ok: true as const, conversations: [row("a"), row("b")], dropped: 0, complete: true })),
  thread: vi.fn(async () => ({ ok: true as const, messages: [msg("new", "2026-03-04T11:00:00.000Z"), msg("old", "2026-03-04T10:00:00.000Z")], dropped: 0, complete: true })),
  ...over,
});

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("loadInbox", () => {
  it("is unavailable with no tenant, without reading", async () => {
    const r = reader();
    expect(await loadInbox(null, r, null)).toEqual({ state: "unavailable" });
    expect(r.list).not.toHaveBeenCalled();
  });

  it("INBOX_READ_DISABLED=true turns the read off", async () => {
    vi.stubEnv("INBOX_READ_DISABLED", "true");
    const r = reader();
    expect(await loadInbox("t1", r, "inbox-a")).toEqual({ state: "unavailable" });
    expect(r.list).not.toHaveBeenCalled();
    expect(r.thread).not.toHaveBeenCalled();
  });

  it.each(["reconnect", "unavailable"] as const)("passes on %s", async (reason) => {
    expect(await loadInbox("t1", reader({ list: async () => ({ ok: false, reason }) }), null)).toEqual({ state: reason });
  });

  it("is unavailable when the reader throws", async () => {
    expect(await loadInbox("t1", reader({ list: async () => { throw new Error("x"); } }), null)).toEqual({ state: "unavailable" });
  });

  it("is empty with no rows, and unavailable when every row was malformed", async () => {
    expect(await loadInbox("t1", reader({ list: async () => ({ ok: true, conversations: [], dropped: 0, complete: true }) }), null)).toEqual({ state: "empty" });
    expect(await loadInbox("t1", reader({ list: async () => ({ ok: true, conversations: [], dropped: 2, complete: true }) }), null)).toEqual({ state: "unavailable" });
  });

  it("reads no thread until a conversation is opened", async () => {
    const r = reader();
    const result = await loadInbox("t1", r, null);
    expect(result).toMatchObject({ state: "ready", selectedId: null, thread: null });
    expect(r.thread).not.toHaveBeenCalled();
  });

  it("reads the opened thread for the session tenant, oldest message first", async () => {
    const r = reader();
    const result = await loadInbox("t1", r, "inbox-b");
    expect(r.thread).toHaveBeenCalledWith("t1", "b");
    expect(result).toMatchObject({ state: "ready", selectedId: "b", thread: { state: "ready" } });
    if (result.state === "ready" && result.thread?.state === "ready") expect(result.thread.messages.map((m) => m.id)).toEqual(["old", "new"]);
  });

  it("never reads a conversation id that is not in this tenant's list", async () => {
    const r = reader();
    const result = await loadInbox("t1", r, "inbox-someone-elses");
    expect(r.thread).not.toHaveBeenCalled();
    expect(result).toMatchObject({ state: "ready", selectedId: null, thread: null });
  });

  it("keeps the list when only the thread fails", async () => {
    const result = await loadInbox("t1", reader({ thread: async () => ({ ok: false, reason: "reconnect" }) }), "inbox-a");
    expect(result).toMatchObject({ state: "ready", selectedId: "a", thread: { state: "reconnect" } });
  });

  it("shows an empty thread as empty, and an all-malformed thread as unavailable", async () => {
    expect(await loadInbox("t1", reader({ thread: async () => ({ ok: true, messages: [], dropped: 0, complete: true }) }), "inbox-a")).toMatchObject({ thread: { state: "empty" } });
    expect(await loadInbox("t1", reader({ thread: async () => ({ ok: true, messages: [], dropped: 1, complete: true }) }), "inbox-a")).toMatchObject({ thread: { state: "unavailable" } });
  });

  it("logs counts only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await loadInbox("t1", reader({ list: async () => ({ ok: true, conversations: [row("a", { name: "Private Name" })], dropped: 1, complete: true }) }), null);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Private Name");
    expect(warn).toHaveBeenCalled();
  });
});

describe("channelOfType", () => {
  it("maps only exact, known types", () => {
    expect(channelOfType("TYPE_SMS")).toBe("Text");
    expect(channelOfType("TYPE_CALL")).toBe("Call");
    expect(channelOfType("TYPE_EMAIL")).toBe("Email");
    expect(channelOfType("TYPE_FACEBOOK")).toBe("Facebook");
    expect(channelOfType("TYPE_INSTAGRAM")).toBe("Instagram");
    expect(channelOfType("TYPE_FORM_SUBMISSION")).toBe("Web form");
    expect(channelOfType("TYPE_SOMETHING_NEW")).toBeNull();
    expect(channelOfType(null)).toBeNull();
  });
});
