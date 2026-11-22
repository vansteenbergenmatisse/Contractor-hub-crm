"use client";

import type { ReasonRequest } from "../types";
import { ReasonSheet } from "./ReasonSheet";

// The reason sheet: the trash icon on a Pipeline card and Lost on a quote open it.
// "Ask again later" answers "later"; the other four answer their own words.
// Escape is Cancel, Tab stays in the sheet, and on close focus goes back to the button that opened it.
export function ReasonDialog({ request, onClose }: { request: ReasonRequest | null; onClose: () => void }) {
  if (!request) return null;
  return <ReasonSheet request={request} onClose={onClose} />;
}
