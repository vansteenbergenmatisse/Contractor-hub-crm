import { describe, expect, it } from "vitest";
import {
  MAX_LINES, SEED_QUOTES, amountLabel, rowFillId, rowFromSearch, sheetBusiness, checkBuild, checkEdit, filterCounts, formatMoney, initialState, isVisible, mockBuildLines, parsePrice,
  quotesReducer, searchRows, sendRequest, statusText, totals, uploadName, type QuotesAction, type QuotesState,
} from "@/features/quotes";

const run = (state: QuotesState, ...actions: QuotesAction[]) => actions.reduce(quotesReducer, state);
const get = (s: QuotesState, id: string) => s.quotes.find((q) => q.id === id)!;
const fresh = () => initialState(SEED_QUOTES);

describe("money", () => {
  it("formats whole dollars with commas", () => {
    expect(formatMoney(18400)).toBe("$18,400");
    expect(formatMoney(950)).toBe("$950");
    expect(formatMoney(1234.6)).toBe("$1,235");
  });
  it("parses a price and a range, and refuses the rest", () => {
    expect(parsePrice("950")).toEqual({ ok: true, low: 950 });
    expect(parsePrice("$1,200")).toEqual({ ok: true, low: 1200 });
    expect(parsePrice("800 to 1,200")).toEqual({ ok: true, low: 800, high: 1200 });
    expect(parsePrice("800-1200")).toEqual({ ok: true, low: 800, high: 1200 });
    for (const bad of ["", "abc", "0", "1200 to 800", "800 to 800", "1.2.3", "12 dollars"]) expect(parsePrice(bad).ok).toBe(false);
  });
  it("labels a price, a range, no price and an own file", () => {
    expect(amountLabel(get(fresh(), "q0"))).toBe("$18,400");
    expect(amountLabel(get(fresh(), "q1"))).toBe("No price yet");
    const built = run(fresh(), { type: "build", id: "q1", service: "Gutter repair", low: 800, high: 1200, lines: mockBuildLines("Gutter repair", 800) });
    expect(amountLabel(get(built, "q1"))).toBe("$800 to $1,200");
    const filed = run(fresh(), { type: "attach", id: "q1", file: "mine.pdf" });
    expect(amountLabel(get(filed, "q1"))).toBe("In your file");
  });
});

describe("build validation", () => {
  it("needs a service and a price, with one error per field", () => {
    expect(checkBuild("", "")).toMatchObject({ ok: false, field: "service", errors: { service: "Say what the service is." } });
    expect(checkBuild("Gutter repair", "x")).toMatchObject({ ok: false, field: "price", errors: { service: "" } });
    expect(checkBuild(" Gutter repair ", "950")).toEqual({ ok: true, service: "Gutter repair", low: 950 });
  });
  it("the mock builder makes one line from what the owner typed and invents no other line or price", () => {
    expect(mockBuildLines("Gutter repair", 950)).toEqual([{ text: "Gutter repair", amount: 950 }]);
    expect(mockBuildLines("Full roof replacement", 18400)).toEqual([{ text: "Full roof replacement", amount: 18400 }]);
    expect(mockBuildLines("Fix", 100)).toEqual([{ text: "Fix", amount: 100 }]);
  });
  it("a typed range builds one line shown as the range", () => {
    const s = run(fresh(), { type: "build", id: "q1", service: "Gutter repair", low: 800, high: 1200, lines: mockBuildLines("Gutter repair", 800) });
    expect(get(s, "q1").lines).toEqual([{ text: "Gutter repair", amount: 800 }]);
    expect(sendRequest(get(s, "q1"), () => {}).doc.lines).toEqual([["Gutter repair", "$800 to $1,200"]]);
  });
});

describe("status flow", () => {
  it("need -> built -> approved -> sent -> accepted, each step on screen only", () => {
    let s = run(fresh(), { type: "build", id: "q1", service: "Gutter repair", low: 950, lines: mockBuildLines("Gutter repair", 950) });
    expect(get(s, "q1").status).toBe("ready");
    s = run(s, { type: "sent", id: "q1" });
    expect(get(s, "q1").status).toBe("sent");
    expect(statusText(get(s, "q1"))).toContain("Nothing left this app");
    s = run(s, { type: "move", id: "q1", to: "won" });
    expect(get(s, "q1").status).toBe("won");
    expect(s.last).toEqual({ id: "q1", prev: "sent" });
  });
  it("only a quote that waits can be sent, only a sent one can be accepted or lost", () => {
    expect(get(run(fresh(), { type: "sent", id: "q1" }), "q1").status).toBe("need");
    expect(get(run(fresh(), { type: "move", id: "q0", to: "won" }), "q0").status).toBe("ready");
    expect(get(run(fresh(), { type: "build", id: "q0", service: "x", low: 5, lines: [] }), "q0").lines).toHaveLength(3);
  });
  it("shows opens on a sent quote", () => {
    expect(statusText(get(fresh(), "q3"))).toBe("Opened 3 times today. Call now.");
  });
  it("lost keeps the reason, later does not, and both can be undone", () => {
    let s = run(fresh(), { type: "move", id: "q2", to: "lost", why: "Said no" });
    expect(statusText(get(s, "q2"))).toContain("Lost: said no.");
    s = run(s, { type: "undo" });
    expect(get(s, "q2").status).toBe("sent");
    expect(get(s, "q2").why).toBeUndefined();
    expect(s.last).toBeNull();
    s = run(s, { type: "move", id: "q2", to: "later" });
    expect(statusText(get(s, "q2"))).toContain("Check Back Later");
  });
  it("a own file replaces the lines, can be removed, and a quote with no lines goes back to need", () => {
    let s = run(fresh(), { type: "attach", id: "q1", file: uploadName("Priya Shah") });
    expect(get(s, "q1")).toMatchObject({ status: "ready", file: "quote-priya-shah.pdf" });
    s = run(s, { type: "detach", id: "q1" });
    expect(get(s, "q1").status).toBe("need");
  });
});

describe("edit", () => {
  const draft = { name: "Derek Olsen", lines: [{ text: "A", amount: "100" }, { text: "B", amount: "$2,000.50" }] };
  it("accepts good fields", () => {
    expect(checkEdit(draft)).toEqual({ ok: true, name: "Derek Olsen", lines: [{ text: "A", amount: 100 }, { text: "B", amount: 2000.5 }] });
  });
  it("holds at most MAX_LINES lines", () => {
    expect(MAX_LINES).toBe(3);
    const line = { text: "A", amount: "100" };
    expect(checkEdit({ name: "Derek Olsen", lines: Array.from({ length: MAX_LINES }, () => line) }).ok).toBe(true);
    expect(checkEdit({ name: "Derek Olsen", lines: Array.from({ length: MAX_LINES + 1 }, () => line) })).toEqual({
      ok: false, field: `t${MAX_LINES}`, message: `A quote holds at most ${MAX_LINES} lines.`,
    });
  });
  it("names the bad field", () => {
    expect(checkEdit({ ...draft, name: " " })).toMatchObject({ ok: false, field: "name", message: "Enter the customer name." });
    expect(checkEdit({ ...draft, lines: [{ text: "", amount: "1" }] })).toMatchObject({ ok: false, field: "t0" });
    expect(checkEdit({ ...draft, lines: [{ text: "A", amount: "12abc" }] })).toMatchObject({ ok: false, field: "a0", message: "Every line needs words and a price in dollars." });
    expect(checkEdit({ ...draft, lines: [{ text: "A", amount: "0" }] }).ok).toBe(false);
  });
  it("save changes the name and the total, and drops a range", () => {
    let s = run(fresh(), { type: "build", id: "q1", service: "G", low: 800, high: 1200, lines: [{ text: "G", amount: 800 }] });
    s = run(s, { type: "see", id: "q1" }, { type: "edit-start" });
    expect(s.editing).toBe(true);
    s = run(s, { type: "edit-save", id: "q1", name: "Priya S.", lines: [{ text: "G", amount: 900 }] });
    expect(get(s, "q1")).toMatchObject({ name: "Priya S." });
    expect(amountLabel(get(s, "q1"))).toBe("$900");
    expect(s.editing).toBe(false);
  });
  it("cannot edit a quote that needs a price or has an own file", () => {
    expect(run(fresh(), { type: "see", id: "q1" }, { type: "edit-start" }).editing).toBe(false);
  });
});

describe("filters, counts, totals", () => {
  it("counts all, to approve (need and ready) and sent", () => {
    expect(filterCounts(fresh().quotes)).toEqual({ all: 7, ready: 2, sent: 5 });
  });
  it("filters rows; won and lost only show under All", () => {
    const s = run(fresh(), { type: "move", id: "q2", to: "won" });
    expect(isVisible(get(s, "q2"), "sent")).toBe(false);
    expect(isVisible(get(s, "q2"), "all")).toBe(true);
    expect(isVisible(get(s, "q1"), "ready")).toBe(true);
    expect(run(s, { type: "filter", filter: "sent" }).filter).toBe("sent");
  });
  it("totals follow the status", () => {
    expect(totals(fresh().quotes)).toEqual({ ready: "$18,400", readyLabel: "1 waits for your OK", out: "$62,250", outLabel: "5 out with customers" });
    const s = run(fresh(), { type: "sent", id: "q0" });
    expect(totals(s.quotes)).toMatchObject({ ready: "$0", readyLabel: "0 wait for your OK", outLabel: "6 out with customers" });
  });
});

describe("send timer request", () => {
  it("carries the document the customer gets and runs onDone only when called", () => {
    let done = 0;
    const req = sendRequest(get(fresh(), "q0"), () => { done++; });
    expect(req).toMatchObject({ kind: "Quote", name: "Derek Olsen", total: "$18,400" });
    expect(req.doc).toMatchObject({ title: "Quote", sub: "Full roof replacement", amount: "$18,400" });
    expect(req.doc.lines[0]).toEqual(["Tear off the old shingles", "$4,200"]);
    expect(done).toBe(0);
    req.onDone();
    expect(done).toBe(1);
  });
  it("uses the range on every line and names an own file", () => {
    const s = run(fresh(), { type: "build", id: "q1", service: "G", low: 800, high: 1200, lines: [{ text: "G", amount: 800 }] });
    expect(sendRequest(get(s, "q1"), () => {}).doc.lines[0]).toEqual(["G", "$800 to $1,200"]);
    const f = run(fresh(), { type: "attach", id: "q1", file: "mine.pdf" });
    const req = sendRequest(get(f, "q1"), () => {});
    expect(req.total).toBe("your own file");
    expect(req.doc).toMatchObject({ file: "mine.pdf", lines: [] });
  });
});

describe("search rows", () => {
  it("points every row at /quotes", () => {
    expect(searchRows).toHaveLength(7);
    expect(searchRows.every((r) => r.page === "quotes" && r.href === "/quotes")).toBe(true);
    expect(searchRows[0]).toMatchObject({ name: "Derek Olsen", sub: "Full roof replacement · $18,400" });
  });
});

describe("one filled button per view", () => {
  const ready = "q0";
  it("on a computer the sheet's send button is the filled one when the sheet shows a quote that waits", () => {
    expect(rowFillId(fresh().quotes, get(fresh(), ready), false, true)).toBeUndefined();
  });
  it("on a computer the first waiting row is filled when the sheet shows another kind of quote, or edits", () => {
    expect(rowFillId(fresh().quotes, get(fresh(), "q2"), false, true)).toBe(ready);
    expect(rowFillId(fresh().quotes, get(fresh(), ready), true, true)).toBe(ready);
  });
  it("on a phone the list hides the sheet, so the first waiting row is filled", () => {
    expect(rowFillId(fresh().quotes, get(fresh(), ready), false, false)).toBe(ready);
  });
  it("no quote waits: no filled row", () => {
    const s = run(fresh(), { type: "sent", id: ready });
    expect(rowFillId(s.quotes, get(s, ready), false, false)).toBeUndefined();
  });
});

describe("opening a row from a link (?row=)", () => {
  it("a quote that needs a price is selected so the owner can type it", () => {
    expect(rowFromSearch("?row=quote-q1", fresh().quotes)).toEqual({ id: "q1", see: false });
  });
  it("a built quote opens its sheet", () => {
    expect(rowFromSearch("?row=quote-q0", fresh().quotes)).toEqual({ id: "q0", see: true });
    expect(rowFromSearch("?x=1&row=quote-q3", fresh().quotes)).toEqual({ id: "q3", see: true });
  });
  it("an unknown or missing row does nothing", () => {
    expect(rowFromSearch("?row=quote-q99", fresh().quotes)).toBeNull();
    expect(rowFromSearch("", fresh().quotes)).toBeNull();
    expect(rowFromSearch("?row=q0", fresh().quotes)).toBeNull();
  });
  it("the select action picks a row without opening the sheet", () => {
    const s = run(fresh(), { type: "select", id: "q1" });
    expect(s.selectedId).toBe("q1");
    expect(s.doc).toBe(false);
  });
});

describe("the business on the sheet", () => {
  const NONE = { business_name: "", business_address: "", business_phone_number: "", business_email: "", business_hours: "", business_website_url: "" };
  it("falls back to the frame's name and initials when the business has no name", () => {
    expect(sheetBusiness(NONE, { name: "Your business", init: "YB" })).toMatchObject({ name: "Your business", init: "YB", addr: "", phone: "" });
  });
  it("uses the custom value name when there is one", () => {
    expect(sheetBusiness({ ...NONE, business_name: "Sample Co" }, { name: "Other", init: "OT" })).toMatchObject({ name: "Sample Co", init: "SC" });
  });
});
