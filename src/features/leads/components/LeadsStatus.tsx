"use client";

import { useRouter } from "next/navigation";
import { useSearchRows, type SearchRow } from "@/features/app-shell";
import { ChannelIcon } from "./ChannelIcon";
import { LeadsHeader } from "./LeadsHeader";

const NO_ROWS: SearchRow[] = [];

const COPY = {
  empty: { icon: "check", title: "No leads yet.", body: "New contacts show up here as soon as they come in." },
  reconnect: { icon: "alert", title: "Your CRM connection needs attention.", body: "Leads can't load until it is reconnected. Ask your account admin to reconnect it." },
  unavailable: { icon: "alert", title: "Your leads can't load right now.", body: "Nothing was changed. Try again in a moment." },
} as const;

// The page when there are no rows to show. Each state says what is true and what to do next.
export function LeadsStatus({ state }: { state: keyof typeof COPY }) {
  const router = useRouter();
  const copy = COPY[state];
  // No rows on screen: the search must not keep rows from an earlier load.
  useSearchRows("leads", NO_ROWS);
  return (
    <>
      <LeadsHeader />
      <div className={`fd-none fx-none fd-in${state !== "empty" ? " is-bad" : ""}`} role={state === "empty" ? "status" : "alert"}>
        <ChannelIcon name={copy.icon} size={20} />
        <p>{copy.title}</p>
        <span>{copy.body}</span>
        {state === "unavailable" && <button type="button" className="fd-btn is-plain" onClick={() => router.refresh()}>Try again</button>}
      </div>
    </>
  );
}
