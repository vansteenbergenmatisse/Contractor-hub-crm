import { describe, expect, it } from "vitest";
import {
  MAX_LINES, SEED_QUOTES, amountLabel, buildDraftOf, hasBusinessHeader, quoteByName, quoteHref, quoteRowActions, quoteSearchRows, rowFillId, rowFromSearch, sheetBusiness, checkBuild, checkEdit, filterCounts, formatMoney, initialState, isVisible, mockBuildLines, parsePrice,
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
    const built = run(fresh(), { type: "build", id: "q1", low: 800, high: 1200, lines: mockBuildLines("Gutter repair", 800) });
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
  it("building keeps the lead's service as the row subtitle; the typed service is only the line text", () => {
    const s = run(fresh(), { type: "build", id: "q1", low: 950, lines: mockBuildLines("Gutter and fascia repair", 950) });
    expect(get(s, "q1").service).toBe("Gutter repair");
    expect(get(s, "q1").lines).toEqual([{ text: "Gutter and fascia repair", amount: 950 }]);
    expect(sendRequest(get(s, "q1"), () => {}).doc.sub).toBe("Gutter repair");
  });
  it("a typed range builds one line shown as the range", () => {
    const s = run(fresh(), { type: "build", id: "q1", low: 800, high: 1200, lines: mockBuildLines("Gutter repair", 800) });
    expect(get(s, "q1").lines).toEqual([{ text: "Gutter repair", amount: 800 }]);
    expect(sendRequest(get(s, "q1"), () => {}).doc.lines).toEqual([["Gutter repair", "$800 to $1,200"]]);
  });
});

describe("status flow", () => {
  it("need -> built -> approved -> sent -> accepted, each step on screen only", () => {
    let s = run(fresh(), { type: "build", id: "q1", low: 950, lines: mockBuildLines("Gutter repair", 950) });
    expect(get(s, "q1").status).toBe("ready");
    s = run(s, { type: "sent", id: "q1" });
    expect(get(s, "q1").status).toBe("sent");
    expect(statusText(get(s, "q1"))).toBe("Sent just now. Follow-ups run.");
    s = run(s, { type: "move", id: "q1", to: "won" });
    expect(get(s, "q1").status).toBe("won");
    expect(statusText(get(s, "q1"))).toBe("Accepted. Booking link sent.");
    expect(s.last).toEqual({ id: "q1", prev: "sent" });
  });
  it("only a quote that waits can be sent, only a sent one can be accepted or lost", () => {
    expect(get(run(fresh(), { type: "sent", id: "q1" }), "q1").status).toBe("need");
    expect(get(run(fresh(), { type: "move", id: "q0", to: "won" }), "q0").status).toBe("ready");
    expect(get(run(fresh(), { type: "build", id: "q0", low: 5, lines: [] }), "q0").lines).toHaveLength(3);
  });
  it("shows opens on a sent quote", () => {
    expect(statusText(get(fresh(), "q3"))).toBe("Opened 3 times today. Call now.");
  });
  it("lost keeps the reason, later does not, and both can be undone", () => {
    let s = run(fresh(), { type: "move", id: "q2", to: "lost", why: "Said no" });
    expect(statusText(get(s, "q2"))).toBe("Lost: Said no. Every text stopped.");
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
    let s = run(fresh(), { type: "build", id: "q1", low: 800, high: 1200, lines: [{ text: "G", amount: 800 }] });
    s = run(s, { type: "see", id: "q1" }, { type: "edit-start" });
    expect(s.editing).toBe(true);
    s = run(s, { type: "edit-save", id: "q1", name: "Priya S.", lines: [{ text: "G", amount: 900 }] });
    expect(get(s, "q1")).toMatchObject({ name: "Priya S." });
    expect(amountLabel(get(s, "q1"))).toBe("$900");
    expect(s.editing).toBe(false);
  });
  it("cannot edit a quote that needs a price or has an own file", () => {
    expect(run(fresh(), { type: "see", id: "q1" }, { type: "edit-start" }).editing).toBe(false);
    expect(run(fresh(), { type: "see", id: "q0" }, { type: "edit-start" }).editing).toBe(true);
    const filed = run(fresh(), { type: "attach", id: "q0", file: "mine.pdf" }, { type: "see", id: "q0" }, { type: "edit-start" });
    expect(get(filed, "q0")).toMatchObject({ status: "ready", file: "mine.pdf" });
    expect(filed.editing).toBe(false);
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
  it("a range counts at its low end in the tile, as in the design (no range wording on the tile)", () => {
    const s = run(fresh(), { type: "build", id: "q1", low: 450, high: 600, lines: mockBuildLines("Gutter repair", 450) });
    expect(totals(s.quotes)).toMatchObject({ ready: "$18,850", readyLabel: "2 wait for your OK" });
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
    const s = run(fresh(), { type: "build", id: "q1", low: 800, high: 1200, lines: [{ text: "G", amount: 800 }] });
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

describe("the filled button on the list (design: the first waiting quote, at every width)", () => {
  const ready = "q0";
  it("the first waiting row is filled, whatever the sheet shows", () => {
    expect(rowFillId(fresh().quotes)).toBe(ready);
    expect(rowFillId(run(fresh(), { type: "see", id: "q2" }).quotes)).toBe(ready);
  });
  it("no quote waits: no filled row", () => {
    const s = run(fresh(), { type: "sent", id: ready });
    expect(rowFillId(s.quotes)).toBeUndefined();
  });
});

describe("opening a row from a link (?row=)", () => {
  // Design `uxOpen`: a search result only brings its row into view; it opens nothing.
  it("a search link names the row and asks for nothing more", () => {
    expect(rowFromSearch("?row=quote-q1", fresh().quotes)).toEqual({ id: "q1", open: null });
    expect(rowFromSearch("?row=quote-q0", fresh().quotes)).toEqual({ id: "q0", open: null });
    expect(rowFromSearch("?x=1&row=quote-q3", fresh().quotes)).toEqual({ id: "q3", open: null });
  });
  it("a Pipeline link asks for the sheet (See quote) or the price field (Add price)", () => {
    expect(rowFromSearch("?row=quote-q0&open=sheet", fresh().quotes)).toEqual({ id: "q0", open: "sheet" });
    expect(rowFromSearch("?row=quote-q1&open=price", fresh().quotes)).toEqual({ id: "q1", open: "price" });
    expect(rowFromSearch("?row=quote-q1&open=bogus", fresh().quotes)).toEqual({ id: "q1", open: null });
    expect(quoteHref("q1", "price")).toBe("/quotes?row=quote-q1&open=price");
    expect(quoteHref("q0", "sheet")).toBe("/quotes?row=quote-q0&open=sheet");
    expect(quoteHref("q2")).toBe("/quotes?row=quote-q2");
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
  it("select (Add price) closes an open sheet and shows every row, as design addPrice", () => {
    const s = run(fresh(), { type: "filter", filter: "sent" }, { type: "see", id: "q2" }, { type: "edit-start" }, { type: "select", id: "q1" });
    expect(s).toMatchObject({ selectedId: "q1", doc: false, filter: "all", editing: false });
  });
});

describe("drafts kept in the page state", () => {
  it("the Build quote fields start with the lead's service and keep what the owner typed", () => {
    const s0 = fresh();
    expect(buildDraftOf(s0, get(s0, "q1"))).toEqual({ service: "Gutter repair", price: "", errors: { service: "", price: "" } });
    const s1 = run(s0, { type: "build-draft", id: "q1", price: "9" }, { type: "build-draft", id: "q1", service: "Gutter fix" });
    expect(buildDraftOf(s1, get(s1, "q1"))).toMatchObject({ service: "Gutter fix", price: "9" });
    const s2 = run(s1, { type: "build", id: "q1", low: 9, lines: mockBuildLines("Gutter fix", 9) });
    expect(s2.builds).toEqual({});
  });
  it("edit-start fills the edit draft from the quote; the draft and its error stay until Save or Cancel", () => {
    let s = run(fresh(), { type: "see", id: "q0" }, { type: "edit-start" });
    expect(s.draft.name).toBe("Derek Olsen");
    expect(s.draft.lines).toHaveLength(3);
    s = run(s, { type: "edit-draft", draft: { ...s.draft, name: "D. Olsen" } }, { type: "edit-error", message: "Enter the customer name." });
    expect(s).toMatchObject({ editing: true, draft: { name: "D. Olsen" }, editError: "Enter the customer name." });
    s = run(s, { type: "edit-cancel" });
    expect(s).toMatchObject({ editing: false, editError: "" });
  });
  it("an edit draft is ignored when not editing", () => {
    const s = fresh();
    expect(run(s, { type: "edit-draft", draft: { name: "x", lines: [] } })).toBe(s);
  });
});

describe("the business on the sheet", () => {
  const NONE = { business_name: "", business_address: "", business_phone_number: "", business_email: "", business_hours: "", business_website_url: "" };
  it("shows no name and no initials when the business has no name (never a made-up one)", () => {
    expect(sheetBusiness(NONE)).toEqual({ name: "", init: "", addr: "", phone: "", email: "", site: "", hours: "", logo: null });
  });
  it("carries the logo link when there is one", () => {
    expect(sheetBusiness(NONE, "https://cdn.example/logo.png").logo).toBe("https://cdn.example/logo.png");
  });
  it("uses the custom value name when there is one", () => {
    expect(sheetBusiness({ ...NONE, business_name: "Sample Co" })).toMatchObject({ name: "Sample Co", init: "SC" });
  });
});

describe("round 3: row actions and cross-page helpers", () => {
  const h = { filled: true, canUndo: false, onUndo() {}, onSee() {}, onApprove() {}, onWon() {}, onLost() {}, onBuild() {}, onUpload() {} };
  const s0 = fresh();
  it("swipe right runs the filled Approve and send, else See the quote; no swipe left; Lost is danger", () => {
    const right = (a: ReturnType<typeof quoteRowActions>) => a.find((x) => x.swipe === "right")?.label;
    expect(right(quoteRowActions(get(s0, "q0"), h))).toBe("Approve and send");
    expect(right(quoteRowActions(get(s0, "q0"), { ...h, filled: false }))).toBe("See the quote");
    const sent = quoteRowActions(get(s0, "q2"), h);
    expect(right(sent)).toBe("See the quote");
    expect(sent.some((x) => x.swipe === "left")).toBe(false);
    expect(sent.find((x) => x.label === "Lost")?.tone).toBe("danger");
    expect(quoteRowActions(get(s0, "q2"), { ...h, canUndo: true })[0].label).toBe("Undo");
  });
  it("finds a quote by the customer's name", () => {
    expect(quoteByName(s0.quotes, "Priya Shah")?.id).toBe("q1");
    expect(quoteByName(s0.quotes, "Nobody")).toBeUndefined();
  });
  it("the sheet header shows only when there is a business value", () => {
    expect(hasBusinessHeader(sheetBusiness({ business_name: "", business_address: "", business_phone_number: "", business_email: "", business_hours: "", business_website_url: "" }))).toBe(false);
    expect(hasBusinessHeader(sheetBusiness({ business_name: "", business_address: "1 Way", business_phone_number: "", business_email: "", business_hours: "", business_website_url: "" }))).toBe(true);
  });
});

describe("live search rows", () => {
  it("a built quote is found with its new price", () => {
    const s = run(fresh(), { type: "build", id: "q1", low: 950, lines: mockBuildLines("Gutter repair", 950) });
    expect(quoteSearchRows(s.quotes).find((r) => r.id === "quote-q1")).toMatchObject({ name: "Priya Shah", sub: "Gutter repair · $950", page: "quotes" });
    expect(quoteSearchRows(fresh().quotes)).toEqual(searchRows);
  });
});
