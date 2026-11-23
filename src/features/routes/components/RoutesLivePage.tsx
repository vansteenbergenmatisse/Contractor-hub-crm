"use client";

import { useNotifyStart } from "../hooks/use-notify-start";
import type { RoutesNotifyView, RoutesResult } from "../types";
import { JobRow } from "./JobRow";
import { NextJobCard } from "./NextJobCard";
import { RoutesHeader } from "./RoutesHeader";
import { RoutesStatus } from "./RoutesStatus";

// The real Routes page: read-only, today's jobs with the next one first.
export function RoutesLivePage({ result, notify }: { result: RoutesResult; notify?: RoutesNotifyView | null }) {
  const { on, toggle, onStart, displayFor } = useNotifyStart(notify);
  if (result.state === "reconnect" || result.state === "unavailable") return <RoutesStatus state={result.state} />;
  if (result.state === "empty") {
    return (
      <div className="fd-cal">
        <RoutesHeader timeZone={result.timeZone} />
        <div className="fd-none fx-none fd-in" role="status">
          <p>{result.reason === "no-calendars" ? "No calendars are set up yet." : "Nothing booked today."}</p>
        </div>
      </div>
    );
  }
  const next = result.jobs.find((job) => job.id === result.nextId) ?? null;
  return (
    <div className="fd-cal">
      <RoutesHeader timeZone={result.timeZone} />
      {result.partial ? <p className="fd-cdl" role="status"><span>Some jobs may be missing from today, so the next job could be a different one.</span></p> : null}
      {next ? <NextJobCard job={next} notify={notify ? { on, onToggle: toggle, onStart, result: displayFor(next.id) } : null} /> : <div className="fd-none fx-none fd-in" role="status"><p>No open jobs left today.</p></div>}
      <ul className="fd-card fd-in" aria-label="Today's jobs" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {result.jobs.map((job) => <JobRow key={job.id} job={job} isNext={job.id === result.nextId} result={notify ? displayFor(job.id) : null} />)}
      </ul>
    </div>
  );
}
