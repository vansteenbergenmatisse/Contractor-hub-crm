"use client";

import { useSearchParams } from "next/navigation";
import { exportAnswer } from "../api/export-answer";

// The reason for a failed export when Leads came back without its export panel.
// `only`: show just this reason (someone without export access still learns why they came back).
export function ExportNotice({ only }: { only?: string }) {
  const code = useSearchParams()?.get("export");
  const message = !only || code === only ? exportAnswer(code) : null;
  return message ? <p className="fd-pns" role="alert">{message}</p> : null;
}
