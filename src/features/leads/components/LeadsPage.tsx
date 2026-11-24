"use client";

import { canExportLeads, type LeadsViewer } from "../api/export-access";
import type { LeadsResult } from "../types";
import { ExportNotice } from "./ExportNotice";
import { LeadsReady } from "./LeadsReady";
import { LeadsStatus } from "./LeadsStatus";

// Page content only. The shell adds the .fd-view wrapper. The server page loads `result`.
// `timeZone`: the location's HighLevel zone; without it the viewer's zone is used.
// `viewer`: from the server session. It only decides what is shown; the export route checks again.
export function LeadsPage({ result, timeZone, viewer }: { result: LeadsResult; timeZone?: string | null; viewer?: LeadsViewer | null }) {
  // A failed export can return here while leads cannot load, and the owner still needs the reason.
  if (result.state !== "ready") return <><LeadsStatus state={result.state} />{canExportLeads(viewer) ? <ExportNotice /> : <ExportNotice only="forbidden" />}</>;
  return <LeadsReady leads={result.leads} loadedAt={result.loadedAt} complete={result.complete} dropped={result.dropped} locationZone={timeZone} canExport={canExportLeads(viewer)} />;
}
