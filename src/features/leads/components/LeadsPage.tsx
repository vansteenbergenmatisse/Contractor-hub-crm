"use client";

import type { LeadsResult } from "../types";
import { LeadsReady } from "./LeadsReady";
import { LeadsStatus } from "./LeadsStatus";

// Page content only. The shell adds the .fd-view wrapper. The server page loads `result`.
export function LeadsPage({ result }: { result: LeadsResult }) {
  if (result.state !== "ready") return <LeadsStatus state={result.state} />;
  return <LeadsReady leads={result.leads} loadedAt={result.loadedAt} complete={result.complete} dropped={result.dropped} />;
}
