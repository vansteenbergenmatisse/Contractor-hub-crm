import type { SearchRow } from "@/features/app-shell";
import type { Conversation, InboxState, TextBusiness } from "../types";
import { initialState, rowIdOf, rowSnippet } from "./state";

const NO_BUSINESS: TextBusiness = { name: "", first: "", site: "", bookingLink: "" };

// One search row per conversation, opening the Inbox. As in the design (logic `uxIndex`) the line under
// the name is "<channel> · <newest message as the row shows it>", so a search finds message text too
// ("1042" finds Bright Daycare's invoice reminder). `state` gives the live rows ("You: ..." after a reply).
export function toSearchRows(
  conversations: readonly Conversation[],
  business: TextBusiness = NO_BUSINESS,
  state: InboxState = initialState(conversations),
): SearchRow[] {
  return conversations.map((c) => ({ id: rowIdOf(c), page: "inbox", name: c.name, sub: `${c.channel} · ${rowSnippet(state, c, business)}`, href: "/inbox" }));
}
