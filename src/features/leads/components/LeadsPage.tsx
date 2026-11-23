"use client";

import type { LeadsResult } from "../types";
import { LeadsReady } from "./LeadsReady";
import { LeadsStatus } from "./LeadsStatus";

// Page content only. The shell adds the .fd-view wrapper. The server page loads `result`.
// `timeZone`: the location's HighLevel zone; without it the viewer's zone is used.
export function LeadsPage({ result, timeZone }: { result: LeadsResult; timeZone?: string | null }) {
  if (result.state !== "ready") return <LeadsStatus state={result.state} />;
  return <LeadsReady leads={result.leads} loadedAt={result.loadedAt} complete={result.complete} dropped={result.dropped} locationZone={timeZone} />;
}
