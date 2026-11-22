import type { SearchRow, SendDoc } from "@/features/app-shell";
import { STAGES } from "./stages";
import type { MockCard } from "../types";

const NO_PRICE = "No price yet";

// What the send timer shows for Send quote and Invoice. Phase 2: sample content from the card.
export function sendDocFor(card: MockCard, kind: "Quote" | "Invoice"): SendDoc {
  const amount = card.amount || NO_PRICE;
  return {
    title: kind,
    name: card.name,
    sub: card.service,
    amount,
    lines: [[card.service, amount]],
  };
}

export function sendTotal(card: MockCard): string {
  return card.amount || NO_PRICE;
}

// One search row per card, at the stage the card starts in.
export function buildSearchRows(cards: readonly MockCard[]): SearchRow[] {
  return cards.map((c, i) => ({
    id: `pipeline-${i}`,
    page: "pipeline",
    name: c.name,
    sub: `${c.service} · ${STAGES[c.stage].name}`,
    href: "/pipeline",
  }));
}
