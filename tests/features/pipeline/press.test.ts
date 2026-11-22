import { describe, expect, it } from "vitest";
import { MOCK_STOPS } from "@/features/calendar";
import { SEED_QUOTES, amountLabel, initialState, quotesReducer } from "@/features/quotes";
import {
  MOCK_CARDS,
  boardReducer,
  buildSearchRows,
  calendarHref,
  canUndo,
  cardIndexOfRow,
  cardView,
  initialBoard,
  moveCard,
  needsPrice,
  pressPlan,
  quoteHref,
  sendDocFor,
  sendTotal,
} from "@/features/pipeline";

const fresh = () => initialBoard(MOCK_CARDS);
const idx = (name: string) => MOCK_CARDS.findIndex((c) => c.name === name);
const card = (name: string) => MOCK_CARDS[idx(name)];

describe("what a card's main button does (pressPlan)", () => {
  it("a plain move dispatches a move that can be undone", () => {
    const i = idx("Maria Alvarez");
    const plan = pressPlan(cardView(fresh(), MOCK_CARDS, i));
    expect(plan).toEqual({ type: "dispatch", action: { type: "move", i, to: 2 } });
    if (plan.type !== "dispatch") throw new Error("expected a dispatch");
    expect(canUndo(boardReducer(fresh(), plan.action))).toBe(true);
  });

  it("Send quote opens the send timer, and the move it makes at 0 has no Undo", () => {
    const i = idx("Derek Olsen");
    const plan = pressPlan(cardView(fresh(), MOCK_CARDS, i));
    if (plan.type !== "send") throw new Error("expected a send");
    expect(plan.request.kind).toBe("Quote");
    expect(plan.request.name).toBe("Derek Olsen");
    expect(plan.request.total).toBe("$18,400");
    expect(plan.done).toEqual({ type: "move", i, to: 4, bySend: true });
    const after = boardReducer(fresh(), plan.done);
    expect(after.sg[i]).toBe(4);
    expect(canUndo(after)).toBe(false);
    expect(cardView(after, MOCK_CARDS, i).showUndo).toBe(false);
  });

  it("Invoice opens the send timer, and the move it makes at 0 has no Undo", () => {
    const i = idx("Owen Fletcher");
    const s = moveCard(fresh(), i, 7);
    const plan = pressPlan(cardView(s, MOCK_CARDS, i));
    if (plan.type !== "send") throw new Error("expected a send");
    expect(plan.request.kind).toBe("Invoice");
    expect(plan.request.doc.title).toBe("Invoice");
    expect(plan.done).toEqual({ type: "move", i, to: 8, bySend: true });
    expect(canUndo(boardReducer(s, plan.done))).toBe(false);
  });

  // Changed in round 3: the link carries its intent (`open=price`), so Quotes puts the cursor in the
  // price field for Add price and only flashes the row for a search result (Quotes finding Q1).
  it("Add price opens Quotes on that customer's row, at its price field", () => {
    const plan = pressPlan(cardView(fresh(), MOCK_CARDS, idx("Priya Shah")));
    const id = SEED_QUOTES.find((q) => q.name === "Priya Shah")!.id;
    expect(plan).toEqual({ type: "navigate", href: `/quotes?row=quote-${id}&open=price` });
  });
});

describe("links to the other pages", () => {
  it("the calendar button opens that customer's stop", () => {
    const stop = MOCK_STOPS.find((s) => s.name === "Tom Becker")!;
    expect(calendarHref("Tom Becker")).toBe(`/calendar?row=${encodeURIComponent(stop.id)}`);
  });
  it("a customer with no stop opens the calendar without a row", () => {
    expect(calendarHref("Nobody Here")).toBe("/calendar");
  });
  // Changed in round 3: See quote asks Quotes to open the sheet (`open=sheet`, Quotes finding Q1).
  it("See quote opens that customer's quote", () => {
    const q = SEED_QUOTES.find((x) => x.name === "Derek Olsen")!;
    expect(quoteHref("Derek Olsen", "sheet")).toBe(`/quotes?row=quote-${q.id}&open=sheet`);
    expect(quoteHref("Derek Olsen")).toBe(`/quotes?row=quote-${q.id}`);
    expect(quoteHref("Nobody Here")).toBe("/quotes");
  });
});

describe("the send document", () => {
  it("an Invoice document has the title Invoice, the card's service and amount", () => {
    const c = card("Owen Fletcher");
    expect(sendDocFor(c, "Invoice")).toEqual({ title: "Invoice", name: c.name, sub: c.service, amount: c.amount, lines: [[c.service, c.amount]] });
  });
  it("a Quote document has the title Quote", () => {
    expect(sendDocFor(card("Derek Olsen"), "Quote").title).toBe("Quote");
  });
  // Changed in round 3: the design's total is the card's empty amount (logic `sendCard`, `this.AMT[i]`).
  it("a card with no amount shows an empty total, as the design does, and never makes one up", () => {
    const c = card("Maria Alvarez");
    expect(c.amount).toBe("");
    const doc = sendDocFor(c, "Quote");
    expect(doc.amount).toBe("");
    expect(doc.lines).toEqual([[c.service, ""]]);
    expect(sendTotal(c)).toBe("");
    expect(sendTotal(card("Derek Olsen"))).toBe("$18,400");
  });
});

describe("Add price only for a quote in the need state", () => {
  it("a card with no amount and no quote in need still offers Send quote in Quote to Send", () => {
    const i = idx("Maria Alvarez");
    expect(needsPrice(MOCK_CARDS[i])).toBe(false);
    const view = cardView(moveCard(fresh(), i, 3), MOCK_CARDS, i);
    expect(view.primary).toEqual({ label: "Send quote", kind: "send-quote", to: 4 });
    const plan = pressPlan(view);
    if (plan.type !== "send") throw new Error("expected a send");
    expect(plan.request.total).toBe("");
  });
  it("the quote in the need state offers Add price", () => {
    expect(needsPrice(card("Priya Shah"))).toBe(true);
  });
});

describe("Quote to Send reads the live Quotes state", () => {
  const live = () => initialState(SEED_QUOTES).quotes;
  const priya = () => SEED_QUOTES.find((q) => q.name === "Priya Shah")!;
  const built = () => quotesReducer(initialState(SEED_QUOTES), { type: "build", id: priya().id, low: 450, lines: [{ text: "Gutter repair", amount: 450 }] }).quotes;

  it("a quote in the need state in Quotes offers Add price", () => {
    const i = idx("Priya Shah");
    expect(needsPrice(card("Priya Shah"), live())).toBe(true);
    const view = cardView(fresh(), MOCK_CARDS, i, undefined, live());
    expect(view.primary).toEqual({ label: "Add price", kind: "add-price", to: 3 });
    expect(view.timeText).toBe("Needs service and price");
  });

  it("once the quote is built on Quotes, the card offers Send quote and See quote, and says Quote ready", () => {
    const i = idx("Priya Shah");
    expect(needsPrice(card("Priya Shah"), built())).toBe(false);
    const view = cardView(fresh(), MOCK_CARDS, i, undefined, built());
    expect(view.primary).toEqual({ label: "Send quote", kind: "send-quote", to: 4 });
    expect(view.seeQuote).toBe(true);
    expect(view.timeText).toBe("Quote ready");
    expect(view.autoText).toBe("AI quote waits for you");
  });

  it("a card with no quote in Quotes does not need a price", () => {
    expect(needsPrice(card("Maria Alvarez"), live())).toBe(false);
  });

  it("Send quote builds the document from the quote: its amount, its lines and its service", () => {
    const i = idx("Priya Shah");
    const quotes = built();
    const plan = pressPlan(cardView(fresh(), MOCK_CARDS, i, undefined, quotes), quotes);
    if (plan.type !== "send") throw new Error("expected a send");
    expect(plan.request).toEqual({ kind: "Quote", name: "Priya Shah", total: "$450", doc: { title: "Quote", name: "Priya Shah", sub: "Gutter repair", amount: "$450", lines: [["Gutter repair", "$450"]] } });
    expect(plan.done).toEqual({ type: "move", i, to: 4, bySend: true });
  });

  it("Derek Olsen's send shows his quote's lines, not one line from the card", () => {
    const i = idx("Derek Olsen");
    const quotes = live();
    const q = quotes.find((x) => x.name === "Derek Olsen")!;
    const plan = pressPlan(cardView(fresh(), MOCK_CARDS, i, undefined, quotes), quotes);
    if (plan.type !== "send") throw new Error("expected a send");
    expect(plan.request.total).toBe(amountLabel(q));
    expect(plan.request.doc.lines).toHaveLength(q.lines.length);
    expect(plan.request.doc.lines[0][0]).toBe(q.lines[0].text);
  });

  it("Invoice still uses the card even when Quotes has that customer", () => {
    const i = idx("Derek Olsen");
    const s = moveCard(fresh(), i, 7);
    const plan = pressPlan(cardView(s, MOCK_CARDS, i, undefined, live()), live());
    if (plan.type !== "send") throw new Error("expected a send");
    expect(plan.request.doc).toEqual(sendDocFor(card("Derek Olsen"), "Invoice"));
  });
});

describe("which card a search row names (cardIndexOfRow)", () => {
  it("reads pipeline-N inside the board", () => {
    expect(cardIndexOfRow("pipeline-0", 5)).toBe(0);
    expect(cardIndexOfRow("pipeline-4", 5)).toBe(4);
  });
  it("rejects an index past the last card, another page's id, extra text and nothing", () => {
    expect(cardIndexOfRow("pipeline-5", 5)).toBe(-1);
    expect(cardIndexOfRow("today-pipeline-2", 5)).toBe(-1);
    expect(cardIndexOfRow("pipeline-2x", 5)).toBe(-1);
    expect(cardIndexOfRow("pipeline--1", 5)).toBe(-1);
    expect(cardIndexOfRow(null, 5)).toBe(-1);
  });
});

describe("live search rows", () => {
  it("name the stage a card is in now", () => {
    const i = idx("Maria Alvarez");
    const s = moveCard(fresh(), i, 2);
    expect(buildSearchRows(MOCK_CARDS, s.sg)[i].sub).toBe("Roof leak repair · Estimate Booked");
    expect(buildSearchRows(MOCK_CARDS)[i].sub).toBe("Roof leak repair · New Lead");
  });
});
