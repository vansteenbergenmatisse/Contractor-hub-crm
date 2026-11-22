import type { SearchRow } from "@/features/app-shell";
import type { Conversation } from "../types";

// One search row per conversation, opening the Inbox.
export function toSearchRows(conversations: readonly Conversation[]): SearchRow[] {
  return conversations.map((c) => ({ id: `inbox-${c.id}`, page: "inbox", name: c.name, sub: `${c.channel} · ${c.sub}`, href: "/inbox" }));
}
