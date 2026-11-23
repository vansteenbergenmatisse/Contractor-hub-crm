"use client";

import type { InboxResult } from "../types";
import { InboxLiveReady } from "./InboxLiveReady";
import { InboxStatus } from "./InboxStatus";

// The Inbox route's content: real conversations, or a state that says why there are none.
export function InboxLivePage({ result }: { result: InboxResult }) {
  return result.state === "ready" ? <InboxLiveReady result={result} /> : <InboxStatus state={result.state} />;
}
