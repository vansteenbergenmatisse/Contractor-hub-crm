import { MOCK_STOPS } from "@/features/calendar";
import { SEED_QUOTES } from "@/features/quotes";

// Links from a card to the same customer on another page. `?row=<id>` names the element with
// `data-row-id=<id>` on the target page, so it can select and highlight it. Phase 2 finds the id by
// the sample customer's name; Phase 3 uses the record ids from the CRM.

export function calendarHref(name: string): string {
  const stop = MOCK_STOPS.find((s) => s.name === name);
  return stop ? `/calendar?row=${encodeURIComponent(stop.id)}` : "/calendar";
}

// The quote row's id is the id of its search row ("quote-<quote id>").
export function quoteHref(name: string): string {
  const quote = SEED_QUOTES.find((q) => q.name === name);
  return quote ? `/quotes?row=${encodeURIComponent(`quote-${quote.id}`)}` : "/quotes";
}
