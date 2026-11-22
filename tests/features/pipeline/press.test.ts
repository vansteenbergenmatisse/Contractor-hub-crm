import { describe, expect, it } from "vitest";
import { MOCK_STOPS } from "@/features/calendar";
import { SEED_QUOTES } from "@/features/quotes";
import {
  MOCK_CARDS,
  boardReducer,
  calendarHref,
  canUndo,
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

  it("Add price opens Quotes on that customer's row", () => {
    const plan = pressPlan(cardView(fresh(), MOCK_CARDS, idx("Priya Shah")));
    const id = SEED_QUOTES.find((q) => q.name === "Priya Shah")!.id;
    expect(plan).toEqual({ type: "navigate", href: `/quotes?row=quote-${id}` });
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
  it("See quote opens that customer's quote", () => {
    const q = SEED_QUOTES.find((x) => x.name === "Derek Olsen")!;
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
  it("a card with no amount says No price yet and never makes one up", () => {
    const c = card("Maria Alvarez");
    expect(c.amount).toBe("");
    const doc = sendDocFor(c, "Quote");
    expect(doc.amount).toBe("No price yet");
    expect(doc.lines).toEqual([[c.service, "No price yet"]]);
    expect(sendTotal(c)).toBe("No price yet");
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
    expect(plan.request.total).toBe("No price yet");
  });
  it("the quote in the need state offers Add price", () => {
    expect(needsPrice(card("Priya Shah"))).toBe(true);
  });
});
