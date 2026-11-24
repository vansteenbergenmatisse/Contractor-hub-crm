"use client";

import { useRouter } from "next/navigation";
import { useKeptReducer, useSearchRows, type SearchRow } from "@/features/app-shell";
import { createInitialState, leadsReducer, visibleAdded } from "../api/leads-logic";
import type { Lead } from "../types";
import { AddedLeadRow } from "./AddedLeadRow";
import { ChannelIcon } from "./ChannelIcon";
import { LeadsHeader } from "./LeadsHeader";

const NO_ROWS: SearchRow[] = [];
const NO_LEADS: readonly Lead[] = [];

const COPY = {
  empty: { icon: "check", title: "No leads yet.", body: "New contacts show up here as soon as they come in." },
  reconnect: { icon: "alert", title: "Your CRM connection needs attention.", body: "Leads can't load until it is reconnected. Ask your account admin to reconnect it." },
  unavailable: { icon: "alert", title: "Your leads can't load right now.", body: "Nothing was changed. Try again in a moment." },
} as const;

// The page when there are no rows to show. Each state says what is true and what to do next.
export function LeadsStatus({ state }: { state: keyof typeof COPY }) {
  const router = useRouter();
  const [kept] = useKeptReducer("leads", leadsReducer, NO_LEADS, createInitialState);
  const added = visibleAdded(kept);
  const copy = COPY[state];
  // A lead added by hand is on this screen, so "no leads" would be false next to it.
  const title = state === "empty" && added.length > 0 ? "No leads from your CRM yet." : copy.title;
  // No rows on screen: the search must not keep rows from an earlier load.
  useSearchRows("leads", NO_ROWS);
  return (
    <>
      <LeadsHeader />
      {added.length > 0 && <div className="fd-lst">{added.map((a) => <AddedLeadRow key={a.id} lead={a} />)}</div>}
      <div className={`fd-none fx-none fd-in${state !== "empty" ? " is-bad" : ""}`} role={state === "empty" ? "status" : "alert"}>
        <ChannelIcon name={copy.icon} size={20} />
        <p>{title}</p>
        <span>{copy.body}</span>
        {state === "unavailable" && <button type="button" className="fd-btn is-plain" onClick={() => router.refresh()}>Try again</button>}
      </div>
    </>
  );
}
