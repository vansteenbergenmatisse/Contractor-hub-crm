// MOCK DATA (Phase 2). The design's sample quotes and customers. Replaced in Phase 3 by the sub-account's
// estimates (HighLevel) and its custom values. Never treat any value here as a real customer or price.
import type { SearchRow } from "@/features/app-shell";
import { amountLabel } from "./api/quotes";
import type { Quote, QuoteLine } from "./types";

const q = (id: string, name: string, service: string, status: Quote["status"], note: string, opens: number, lines: Array<[string, number]>): Quote => ({
  id, name, service, status, baseStatus: status, note, opens, lines: lines.map(([text, amount]) => ({ text, amount })),
});

export const SEED_QUOTES: readonly Quote[] = [
  q("q0", "Derek Olsen", "Full roof replacement", "ready", "The AI built it. It waits for your OK.", 0, [["Tear off the old shingles", 4200], ["Architectural shingles, 28 squares", 11600], ["Flashing and vents", 2600]]),
  q("q1", "Priya Shah", "Gutter repair", "need", "", 0, []),
  q("q2", "Harlan Realty", "Roof replacement", "sent", "Sent yesterday", 0, [["Roof replacement, 46 squares", 27900], ["Gutters and downspouts", 3500]]),
  q("q3", "Raj Patel", "Gutter replacement", "sent", "", 3, [["Aluminum gutters, 240 feet", 10400], ["Gutter guards", 2500]]),
  q("q4", "Nina Castillo", "Skylight install", "sent", "Day 6. Asked for a lower price.", 0, [["Two skylights with flashing", 6900], ["Inside trim and paint", 1300]]),
  q("q5", "Mark Jensen", "Shingle repair", "sent", "Day 2", 0, [["Replace storm-damaged shingles", 5200], ["Ridge cap", 950]]),
  q("q6", "Tina Wu", "Roof coating", "sent", "Day 12", 0, [["Elastomeric roof coating", 3100], ["Prep and patch", 500]]),
];

// The "Quotes you win" tile. A fixed sample until Phase 3 counts real accepted quotes.
export const WIN_TILE = { value: "3 of 10", label: "Quotes you win" } as const;

// MOCK: stands in for "the AI builds the quote". It calls no model and no network. It splits the typed
// price into canned lines for the typed service. The real builder (a model call on the server) is Phase 3.
export function mockBuildLines(service: string, low: number): QuoteLine[] {
  if (low < 300) return [{ text: service, amount: low }];
  const labor = Math.round(low * 0.4);
  const materials = Math.round(low * 0.5);
  return [
    { text: `${service}, labor`, amount: labor },
    { text: `${service}, materials`, amount: materials },
    { text: "Cleanup and haul away", amount: Math.round((low - labor - materials) * 100) / 100 },
  ];
}

// Rows for the shared search. Hrefs open this page.
export const searchRows: SearchRow[] = SEED_QUOTES.map((quote) => ({
  id: `quote-${quote.id}`,
  page: "quotes",
  name: quote.name,
  sub: `${quote.service} · ${amountLabel(quote)}`,
  href: "/quotes",
}));
