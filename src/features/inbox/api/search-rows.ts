import type { SearchRow } from "@/features/app-shell";
import type { Conversation } from "../types";
import { rowIdOf } from "./state";

// One search row per conversation, opening the Inbox.
export function toSearchRows(conversations: readonly Conversation[]): SearchRow[] {
  return conversations.map((c) => ({ id: rowIdOf(c), page: "inbox", name: c.name, sub: `${c.channel} · ${c.sub}`, href: "/inbox" }));
}
