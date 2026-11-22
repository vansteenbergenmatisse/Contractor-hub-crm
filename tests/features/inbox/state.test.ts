import { describe, expect, it } from "vitest";
import {
  deliveryLabel, doneLabel, filterCounts, initialState, inboxReducer, isVisible, replyLabel, rowSnippet, rowTime,
  rowWaitLabel, summarize, visibleCount, waitingCount,
} from "../../../src/features/inbox/api/state";
import { waitLevelClass } from "../../../src/features/inbox/api/wait";
import { bookingLinkOf, fillText, replyName, siteOf } from "../../../src/features/inbox/api/text";
import { toSearchRows } from "../../../src/features/inbox/api/search-rows";
import { INBOX_WAITING_COUNT, MOCK_CONVERSATIONS as C } from "../../../src/features/inbox/mock";
import { searchRows } from "@/features/inbox";
import type { Conversation, InboxAction, InboxState } from "../../../src/features/inbox/types";

const biz = { name: "Sample Roofing", first: "Pat", site: "sample.example", bookingLink: "sample.example/book" };
const none = { name: "", first: "", site: "", bookingLink: "" };
const run = (s: InboxState, ...actions: InboxAction[]) => actions.reduce(inboxReducer, s);
const start = () => initialState(C);
const byName = (n: string) => C.find((c) => c.name === n) as Conversation;

describe("mock data", () => {
  it("counts the waiting conversations", () => {
    expect(INBOX_WAITING_COUNT).toBe(3);
    expect(waitingCount(start())).toBe(INBOX_WAITING_COUNT);
  });
  it("keeps business facts out of the sample texts", () => {
    const all = JSON.stringify(C);
    expect(all).not.toContain("Northway");
    expect(all).not.toContain("Mike");
  });
});

describe("filters", () => {
  it("counts all conversations and the waiting ones per tier", () => {
    expect(filterCounts(start(), C)).toEqual({ all: 9, warn: 1, bad: 1, hot: 1 });
  });
  it("shows everyone under All", () => {
    expect(visibleCount(start(), C)).toBe(9);
  });
  it("shows only waiting conversations of the tier", () => {
    const s = run(start(), { type: "filter", filter: "hot" });
    expect(C.filter((c) => isVisible(s, c)).map((c) => c.name)).toEqual(["Nina Castillo"]);
    expect(s.event).toBe("flt");
  });
  it("shows the empty state when a tier has nobody, and Show all brings everyone back", () => {
    let s = run(start(), { type: "filter", filter: "warn" }, { type: "open", id: "c1" }, { type: "toggleDone" });
    expect(visibleCount(s, C)).toBe(0);
    s = run(s, { type: "filter", filter: "all" });
    expect(visibleCount(s, C)).toBe(9);
  });
  it("ignores a filter that is already on", () => {
    const s = start();
    expect(inboxReducer(s, { type: "filter", filter: "all" })).toBe(s);
  });
});

describe("open, back and the summary button", () => {
  it("opens a conversation and goes back to the list", () => {
    let s = run(start(), { type: "open", id: "c2" });
    expect(s).toMatchObject({ selected: "c2", open: true, event: "open", swaps: 1 });
    s = run(s, { type: "open", id: "c2" });
    expect(s.swaps).toBe(1);
    s = run(s, { type: "toList" });
    expect(s).toMatchObject({ open: false, event: "list" });
  });
  it("summarizes who waits longest and opens them from All", () => {
    const sum = summarize(start(), C);
    expect(sum.lead).toBe("3 people wait on you.");
    expect(sum.rest).toBe("Nina waits longest: 2 days.");
    expect(sum.button).toBe("Reply to Nina");
    expect(sum.cls).toBe("fd-wsum is-hot");
    const s = run(start(), { type: "filter", filter: "warn" }, { type: "replyTo", id: sum.targetId as string });
    expect(s).toMatchObject({ filter: "all", selected: "c3", open: true });
  });
  it("speaks of one person, and names an email contact in full", () => {
    const s = { ...start(), needs: { ...start().needs, c1: false, c2: false, c5: true } };
    const sum = summarize(s, C);
    expect(sum.lead).toBe("2 people wait on you.");
    const only = { ...s, needs: { ...s.needs, c3: false } };
    const one = summarize(only, C);
    expect(one.lead).toBe("1 person waits on you.");
    expect(one.rest).toBe("Bright Daycare waits 0 min.");
    expect(one.button).toBe("Reply to Bright Daycare");
  });
  it("says nobody waits when all are done", () => {
    let s = start();
    for (const id of ["c1", "c2", "c3"]) s = run(s, { type: "open", id }, { type: "toggleDone" });
    const sum = summarize(s, C);
    expect(sum).toMatchObject({ calm: true, cls: "fd-wsum is-calm", lead: "Nobody waits on you.", button: "", targetId: null });
  });
});

describe("send", () => {
  it("adds the message, clears the wait and updates the row", () => {
    const s = run(start(), { type: "open", id: "c1" }, { type: "send", text: "  On my way  " });
    expect(s.sent.c1).toEqual(["On my way"]);
    expect(s.needs.c1).toBe(false);
    expect(waitingCount(s)).toBe(2);
    expect(rowSnippet(s, byName("Maria Alvarez"), biz)).toBe("You: On my way");
    expect(rowTime(s, byName("Maria Alvarez"))).toBe("Just now");
    expect(s.event).toBe("send");
  });
  it("keeps several messages in order", () => {
    const s = run(start(), { type: "send", text: "one" }, { type: "send", text: "two" });
    expect(s.sent.c1).toEqual(["one", "two"]);
  });
  it("ignores an empty message", () => {
    const s = start();
    expect(inboxReducer(s, { type: "send", text: "   " })).toBe(s);
  });
});

describe("mark done and flag for reply (undo)", () => {
  it("toggles and restores the exact waiting state", () => {
    const before = start();
    const done = run(before, { type: "toggleDone" });
    expect(done.needs.c1).toBe(false);
    expect(doneLabel(done, C[0])).toBe("Flag for reply");
    const back = run(done, { type: "toggleDone" });
    expect(back.needs).toEqual(before.needs);
    expect(doneLabel(back, C[0])).toBe("Mark done");
  });
  it("can flag a conversation that did not wait", () => {
    const s = run(start(), { type: "open", id: "c4" }, { type: "toggleDone" });
    expect(s.needs.c4).toBe(true);
    expect(waitingCount(s)).toBe(4);
  });
});

describe("labels", () => {
  it("fills the business facts in sample texts", () => {
    expect(fillText("Hi, {name}. {first} calls. {booking link}", biz)).toBe("Hi, Sample Roofing. Pat calls. sample.example/book");
    expect(rowSnippet(start(), byName("Ellen Novak"), biz)).toBe("System: Hi Ellen, thanks for your request. We got it. Pat calls you soon.");
  });
  it("never writes a made-up or empty fact into a text", () => {
    const all = C.map((c) => [fillText(c.snippet, none), ...c.thread.map((m) => ("text" in m ? fillText(m.text, none) : ""))].join("\n")).join("\n");
    for (const bad of ["Northway", "Mike", "undefined", "null", "{name}", "{first}", " ,", " ()", "  "]) expect(all).not.toContain(bad);
    expect(fillText("Hi {name}, {first} from {name}", none)).toBe("Hi our team, our team");
    expect(fillText("{first} calls you soon.", none)).toBe("Our team calls you soon.");
    expect(fillText("Reminder: {first} from {name} visits.", none)).toBe("Reminder: our team visits.");
    expect(fillText("Reminder: {first} from {name} visits.", { ...none, first: "Pat" })).toBe("Reminder: Pat visits.");
  });
  it("picks the booking link: the real one, else the website's /book, else nothing", () => {
    expect(bookingLinkOf("https://book.example/job", "site.example")).toBe("https://book.example/job");
    expect(bookingLinkOf(null, "site.example")).toBe("site.example/book");
    expect(bookingLinkOf(null, "")).toBe("");
  });
  it("takes the site without protocol and www", () => {
    expect(siteOf("https://www.x.example/a")).toBe("x.example");
  });
  it("labels the reply box", () => {
    expect(replyLabel(byName("Maria Alvarez"))).toBe("Reply to Maria by text");
    expect(replyLabel(byName("Harlan Realty"))).toBe("Reply to Harlan Realty by email");
    expect(replyName("Dana Kim", "Facebook")).toBe("Dana");
  });
  it("shows Delivered or Seen, never on email", () => {
    expect(deliveryLabel(start(), byName("Maria Alvarez")).show).toBe(false);
    expect(deliveryLabel(start(), byName("Linda Park"))).toEqual({ show: true, text: "Delivered" });
    expect(deliveryLabel(run(start(), { type: "open", id: "c7" }, { type: "send", text: "x" }), byName("Hannah Brooks"))).toEqual({ show: true, text: "Seen" });
    expect(deliveryLabel(start(), byName("Bright Daycare")).show).toBe(false);
  });
});

describe("search rows", () => {
  it("has one row per conversation pointing at the inbox", () => {
    expect(searchRows).toHaveLength(9);
    expect(searchRows.every((r) => r.page === "inbox" && r.href === "/inbox")).toBe(true);
    expect(toSearchRows([C[0]])[0]).toMatchObject({ name: "Maria Alvarez", sub: "Call · Roof leak repair · New Lead" });
  });
});

describe("spec mock: minutes waiting of the conversations that do not wait", () => {
  it("is 0 for every conversation that needs no reply, as in the design", () => {
    for (const c of C.filter((x) => !x.needsReply)) expect(c.minutesWaiting, c.name).toBe(0);
  });
  it("Flag for reply shows Waiting 0 min in the amber tier and counts under 1 hour", () => {
    const s = run(start(), { type: "open", id: "c4" }, { type: "toggleDone" });
    expect(rowWaitLabel(byName("Dana Kim"))).toBe("Waiting 0 min");
    expect(waitLevelClass(byName("Dana Kim").minutesWaiting)).toBe("is-warn");
    expect(filterCounts(s, C)).toEqual({ all: 9, warn: 2, bad: 1, hot: 1 });
  });
});

describe("who waits longest: a tie", () => {
  it("picks the first in the list when two wait the same minutes", () => {
    const a = { ...byName("Maria Alvarez"), id: "t1", name: "Ann First", minutesWaiting: 90 };
    const b = { ...byName("Jordan Reyes"), id: "t2", name: "Bob Second", minutesWaiting: 90 };
    const list = [a, b];
    const sum = summarize(initialState(list), list);
    expect(sum.targetId).toBe("t1");
    expect(sum.rest).toBe("Ann waits longest: 1 hr.");
  });
});
