"use client";

import { useRouter } from "next/navigation";
import { useSearchRows, type SearchRow } from "@/features/app-shell";
import type { PipelineChoice } from "../types";
import { LivePipelineHeader } from "./LivePipelineHeader";
import { PipelineSwitcher } from "./PipelineSwitcher";

const NO_ROWS: SearchRow[] = [];

const COPY = {
  empty: { title: "No open deals here.", body: "New deals show up here once they are in your CRM." },
  reconnect: { title: "Your CRM connection needs attention.", body: "The pipeline can't load until it is reconnected. Ask your account admin to reconnect it." },
  unavailable: { title: "Your pipeline can't load right now.", body: "Nothing was changed. Try again in a moment." },
} as const;

// The page when there is no board to show. Each state says what is true and what to do next.
export function LivePipelineStatus({ state, pipelines = [], current = null }: { state: keyof typeof COPY; pipelines?: readonly PipelineChoice[]; current?: string | null }) {
  const router = useRouter();
  const copy = COPY[state];
  // No cards on screen: the search must not keep rows from an earlier load.
  useSearchRows("pipeline", NO_ROWS);
  return (
    <>
      <LivePipelineHeader />
      <PipelineSwitcher pipelines={pipelines} current={current} />
      <div className={`fd-none fx-none fd-in${state !== "empty" ? " is-bad" : ""}`} role={state === "empty" ? "status" : "alert"}>
        <p>{copy.title}</p>
        <span>{copy.body}</span>
        {state === "unavailable" ? <button type="button" className="fd-btn is-plain" onClick={() => router.refresh()}>Try again</button> : null}
      </div>
    </>
  );
}
