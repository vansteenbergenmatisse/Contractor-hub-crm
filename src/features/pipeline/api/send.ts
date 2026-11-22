import type { SearchRow, SendDoc } from "@/features/app-shell";
import { STAGES } from "./stages";
import type { MockCard } from "../types";

// What the send timer shows for Invoice, and for Send quote when Quotes has no quote for the card.
// Phase 2: sample content from the card. A card with no amount shows an empty total, as the design
// does (logic `sendCard`: `this.AMT[i]`); it never makes a price up.
export function sendDocFor(card: MockCard, kind: "Quote" | "Invoice"): SendDoc {
  const amount = card.amount;
  return {
    title: kind,
    name: card.name,
    sub: card.service,
    amount,
    lines: [[card.service, amount]],
  };
}

export function sendTotal(card: MockCard): string {
  return card.amount;
}

// One search row per card, at the stage it is in: `stages` is the board's live stage per card (the
// page hands these rows to the shell's search, so a moved card is found in its new stage). Left out,
// the stage the card starts in.
export function buildSearchRows(cards: readonly MockCard[], stages?: readonly number[]): SearchRow[] {
  return cards.map((c, i) => ({
    id: `pipeline-${i}`,
    page: "pipeline",
    name: c.name,
    sub: `${c.service} · ${STAGES[stages?.[i] ?? c.stage].name}`,
    href: "/pipeline",
  }));
}
