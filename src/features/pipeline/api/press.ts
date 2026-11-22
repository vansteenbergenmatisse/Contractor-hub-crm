import type { SendTimerRequest } from "@/features/app-shell";
import type { BoardAction } from "./board";
import { quoteHref } from "./links";
import { sendDocFor, sendTotal } from "./send";
import type { CardView } from "../types";

// What a card's main button does, as data. The hook carries it out. Pure, so the rule "a card moved
// by a send has no Undo" is tested here and not only inside React.
export type PressPlan =
  | { type: "dispatch"; action: BoardAction }
  | { type: "navigate"; href: string }
  // Open the 20 second send timer. At 0 the board runs `done`, a move made by the send (no Undo).
  | { type: "send"; request: Omit<SendTimerRequest, "onDone">; done: BoardAction };

export function pressPlan(view: CardView): PressPlan {
  const { i, card, primary } = view;
  if (primary.kind === "move") return { type: "dispatch", action: { type: "move", i, to: primary.to } };
  if (primary.kind === "add-price") return { type: "navigate", href: quoteHref(card.name) };
  const kind = primary.kind === "send-quote" ? "Quote" : "Invoice";
  return {
    type: "send",
    request: { kind, name: card.name, total: sendTotal(card), doc: sendDocFor(card, kind) },
    done: { type: "move", i, to: primary.to, bySend: true },
  };
}
