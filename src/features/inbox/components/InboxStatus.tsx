"use client";

import { useRouter } from "next/navigation";
import { useSearchRows, type SearchRow } from "@/features/app-shell";
import { InboxHeader } from "./InboxHeader";

const NO_ROWS: SearchRow[] = [];

const COPY = {
  empty: { title: "No conversations yet.", body: "New messages show up here as soon as they come in." },
  reconnect: { title: "Your CRM connection needs attention.", body: "Conversations can't load until it is reconnected. Ask your account admin to reconnect it." },
  unavailable: { title: "Your conversations can't load right now.", body: "Nothing was changed. Try again in a moment." },
} as const;

// The page when there are no rows to show. Each state says what is true and what to do next.
export function InboxStatus({ state }: { state: keyof typeof COPY }) {
  const router = useRouter();
  const copy = COPY[state];
  // No rows on screen: search must not keep rows from an earlier load.
  useSearchRows("inbox", NO_ROWS);
  return (
    <div className="fd-ix">
      <InboxHeader />
      <div className={`fd-none fx-none fd-in${state !== "empty" ? " is-bad" : ""}`} role={state === "empty" ? "status" : "alert"}>
        <p>{copy.title}</p>
        <span>{copy.body}</span>
        {state === "unavailable" && <button type="button" className="fd-btn is-plain" onClick={() => router.refresh()}>Try again</button>}
      </div>
    </div>
  );
}
