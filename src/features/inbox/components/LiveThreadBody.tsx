"use client";

import { useRouter } from "next/navigation";
import { useTimeZone } from "../hooks/use-time-zone";
import type { LiveThread } from "../types";

const COPY = {
  empty: "No messages in this conversation.",
  reconnect: "Your CRM connection needs attention. Ask your account admin to reconnect it.",
  unavailable: "This conversation can't load right now. Nothing was changed.",
} as const;

// The messages of one conversation. An outbound message reads "Sent": the data does not reliably say
// whether a person or an automation sent it.
export function LiveThreadBody({ thread }: { thread: LiveThread }) {
  const router = useRouter();
  const timeZone = useTimeZone();
  if (thread.state !== "ready") {
    return (
      <div className={`fd-none fx-none${thread.state !== "empty" ? " is-bad" : ""}`} role={thread.state === "empty" ? "status" : "alert"}>
        <p>{COPY[thread.state]}</p>
        {thread.state === "unavailable" && <button type="button" className="fd-btn is-plain" onClick={() => router.refresh()}>Try again</button>}
      </div>
    );
  }
  const format = new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <div className="fd-tcv">
      {!thread.complete && <p className="fd-mday">Older messages are not shown.</p>}
      {thread.dropped > 0 && <p className="fd-mday">Some messages could not be shown.</p>}
      {thread.messages.map((m) => {
        const time = format.format(Date.parse(m.at));
        return (
          <div key={m.id} className={`fd-m ${m.direction === "inbound" ? "is-in" : "is-out"}`}>
            <p className="fd-mb">{m.body ?? "No text to show."}</p>
            <p className="fd-mt">{m.direction === "inbound" ? time : `Sent · ${time}`}</p>
          </div>
        );
      })}
    </div>
  );
}
