"use client";

import { useSearchParams } from "next/navigation";
import { exportAnswer } from "../api/export-answer";

// The reason for a failed export when Leads came back without its export panel.
export function ExportNotice() {
  const message = exportAnswer(useSearchParams()?.get("export"));
  return message ? <p className="fd-pns" role="alert">{message}</p> : null;
}
