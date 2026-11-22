import type { SendTimerRequest } from "@/features/app-shell";
import { sendRequest, type QuotesState } from "@/features/quotes";
import type { BoardAction } from "./board";
import { quoteHref } from "./links";
import { sendDocFor, sendTotal } from "./send";
import type { CardView } from "../types";

type Quote = QuotesState["quotes"][number];

// What a card's main button does, as data. The hook carries it out. Pure, so the rule "a card moved
// by a send has no Undo" is tested here and not only inside React.
export type PressPlan =
  | { type: "dispatch"; action: BoardAction }
  | { type: "navigate"; href: string }
  // Open the 20 second send timer. At 0 the board runs `done`, a move made by the send (no Undo).
  | { type: "send"; request: Omit<SendTimerRequest, "onDone">; done: BoardAction };

// `quotes`: the live Quotes state. Send quote shows the customer's quote from Quotes (its amount, lines
// and own file), as the design does (logic `sendCard`: `q.amt(j)`, `q.docOf(j)`). A card with no quote
// in Quotes, and Invoice, use the card's own service and amount.
export function pressPlan(view: CardView, quotes?: readonly Quote[]): PressPlan {
  const { i, card, primary } = view;
  if (primary.kind === "move") return { type: "dispatch", action: { type: "move", i, to: primary.to } };
  if (primary.kind === "add-price") return { type: "navigate", href: quoteHref(card.name, "price") };
  const done: BoardAction = { type: "move", i, to: primary.to, bySend: true };
  const kind = primary.kind === "send-quote" ? "Quote" : "Invoice";
  const quote = kind === "Quote" ? quotes?.find((q) => q.name === card.name) : undefined;
  if (quote) {
    const { kind: k, name, total, doc } = sendRequest(quote, () => {});
    return { type: "send", request: { kind: k, name, total, doc }, done };
  }
  return { type: "send", request: { kind, name: card.name, total: sendTotal(card), doc: sendDocFor(card, kind) }, done };
}
