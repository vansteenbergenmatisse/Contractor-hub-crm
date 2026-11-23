"use client";

import { useInboxBadge } from "@/features/app-shell";
import type { InboxResult } from "../types";
import { InboxLiveReady } from "./InboxLiveReady";
import { InboxStatus } from "./InboxStatus";

// The Inbox route's content: real conversations, or a state that says why there are none.
export function InboxLivePage({ result }: { result: InboxResult }) {
  // Conversations with unread messages. No count when the Inbox could not be read.
  useInboxBadge(result.state === "ready" ? result.conversations.filter((c) => c.unreadCount > 0).length : 0);
  return result.state === "ready" ? <InboxLiveReady result={result} /> : <InboxStatus state={result.state} />;
}
