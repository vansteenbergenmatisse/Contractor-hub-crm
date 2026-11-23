import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/features/app-shell", async (orig) => ({
  ...(await orig<typeof import("@/features/app-shell")>()),
  usePushed: vi.fn(),
  useSearchRows: vi.fn(),
}));

import { InboxLivePage, InboxSkeleton } from "@/features/inbox";
import type { InboxResult } from "@/features/inbox";
import { MOCK_CONVERSATIONS } from "../../../src/features/inbox/mock";

// All values are fake.
const conversations = [
  { id: "a", name: "Pat Test", channel: "Text" as const, snippet: "Is Friday fine?", unreadCount: 2 },
  { id: "b", name: "Unnamed Row", channel: null, snippet: "", unreadCount: 0 },
];
const ready = (over: Partial<Extract<InboxResult, { state: "ready" }>> = {}): InboxResult => ({
  state: "ready", conversations, complete: true, dropped: 0, selectedId: null, thread: null, ...over,
});
const html = (result: InboxResult) => renderToStaticMarkup(<InboxLivePage result={result} />);
const opened = (thread: Extract<InboxResult, { state: "ready" }>["thread"]) => html(ready({ selectedId: "a", thread }));
const thread = {
  state: "ready" as const, complete: true, dropped: 0,
  messages: [
    { id: "1", direction: "inbound" as const, body: "Can you come Friday?", at: "2026-03-04T10:00:00.000Z" },
    { id: "2", direction: "outbound" as const, body: "Yes, we can.", at: "2026-03-04T11:00:00.000Z" },
    { id: "3", direction: "inbound" as const, body: null, at: "2026-03-04T12:00:00.000Z" },
  ],
};

describe("states", () => {
  it.each([
    ["empty", "No conversations yet."],
    ["reconnect", "Your CRM connection needs attention."],
    ["unavailable", "Your conversations can&#x27;t load right now."],
  ] as const)("%s says what is true", (state, text) => {
    const out = html({ state });
    expect(out).toContain('<h1 class="fd-pt">Communications</h1>');
    expect(out).toContain(text);
    expect(out).not.toContain("fd-cr ");
  });

  it("offers Try again only when a retry can help", () => {
    expect(html({ state: "unavailable" })).toContain("Try again");
    expect(html({ state: "reconnect" })).not.toContain("Try again");
    expect(html({ state: "empty" })).not.toContain("Try again");
  });

  it("the skeleton holds no value", () => {
    expect(renderToStaticMarkup(<InboxSkeleton />)).toContain('aria-busy="true"');
  });

  it("no state renders a sample conversation", () => {
    const all = [html({ state: "empty" }), html({ state: "reconnect" }), html({ state: "unavailable" }), html(ready()), opened(thread)].join("");
    for (const sample of MOCK_CONVERSATIONS) expect(all).not.toContain(sample.name);
  });
});

describe("ready", () => {
  it("lists real rows with the channel, snippet and unread count", () => {
    const out = html(ready());
    expect(out).toContain("Pat Test");
    expect(out).toContain("Is Friday fine?");
    expect(out).toContain("2 unread");
    expect(out).toContain('data-row-id="inbox-a"');
  });

  it("claims no wait time, because the data has none", () => {
    expect(html(ready())).not.toMatch(/Waiting|wait on you|Under 1 Hr/);
  });

  it("has no local Mark done or Flag control", () => {
    expect(opened(thread)).not.toMatch(/Mark done|Flag for reply/);
  });

  it("says when the list is partial", () => {
    expect(html(ready({ complete: false }))).toContain("Showing the newest conversations only.");
    expect(html(ready({ dropped: 1 }))).toContain("Some conversations could not be shown.");
  });

  it("asks to pick a conversation before one is open", () => {
    const out = html(ready());
    expect(out).toContain("Pick a conversation");
    expect(out).not.toContain("fd-ix is-open");
  });
});

describe("thread", () => {
  it("opens with inbound and outbound messages, and never says who sent an outbound one", () => {
    const out = opened(thread);
    expect(out).toContain("fd-ix is-open");
    expect(out).toContain('<div class="fd-m is-in"><p class="fd-mb">Can you come Friday?</p>');
    expect(out).toContain('<div class="fd-m is-out"><p class="fd-mb">Yes, we can.</p>');
    expect(out).toContain("Sent ·");
    expect(out).not.toContain("You ·");
    expect(out).not.toContain("Sent by the system");
    expect(out).toContain("No text to show.");
  });

  it("escapes message text", () => {
    const out = opened({ ...thread, messages: [{ id: "x", direction: "inbound", body: "<img src=x onerror=alert(1)>", at: "2026-03-04T10:00:00.000Z" }] });
    expect(out).not.toContain("<img");
  });

  it("says when older messages are left out", () => {
    expect(opened({ ...thread, complete: false })).toContain("Older messages are not shown.");
  });

  it.each([
    ["empty", "No messages in this conversation."],
    ["reconnect", "Your CRM connection needs attention."],
    ["unavailable", "This conversation can&#x27;t load right now."],
  ] as const)("thread state %s", (state, text) => {
    const out = opened({ state });
    expect(out).toContain(text);
    expect(out).toContain("Pat Test");
  });
});

describe("writes stay off", () => {
  const out = opened(thread);
  it("disables the reply box, Send and Call, and says so", () => {
    expect(out).toMatch(/<input[^>]*id="fd-reply"[^>]*disabled/);
    expect(out).toMatch(/<button[^>]*disabled[^>]*>Send<\/button>|<button[^>]*fd-send[^>]*disabled/);
    expect(out).toMatch(/<button[^>]*fd-tcall[^>]*disabled/);
    expect(out).toContain("Replying and calling from here are off for now. Nothing is sent.");
  });
  it("offers no quick replies and no phone link", () => {
    expect(out).not.toContain("fd-qb");
    expect(out).not.toContain('href="tel:');
  });
});
