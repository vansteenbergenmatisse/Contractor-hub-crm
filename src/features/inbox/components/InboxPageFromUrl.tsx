"use client";

import { useSearchParams } from "next/navigation";
import { InboxPage } from "./InboxPage";

// The route's entry: reads ?row=<id> (the shell search's convention) and opens that conversation.
// The route wraps it in Suspense because useSearchParams needs one.
export function InboxPageFromUrl() {
  const row = useSearchParams().get("row");
  return <InboxPage row={row} />;
}
