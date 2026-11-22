import type { SearchRow } from "@/features/app-shell";
import type { AddedLead } from "../types";
import { MOCK_LEADS } from "../mock";
import { SOURCE_LABEL } from "./leads-logic";

// Rows the global search can find (mock, Phase 2). Each opens the Leads page.
export const searchRows: SearchRow[] = MOCK_LEADS.map((l) => ({
  id: l.id,
  page: "leads",
  name: l.name,
  sub: `${l.need} · ${SOURCE_LABEL[l.source]}`,
  href: "/leads",
}));

// The rows of what Leads shows now: the hand-added leads on top (as the list draws them), then the
// sample leads. The page hands these to the shell's search (design: search reads the rendered rows).
export function liveSearchRows(added: readonly AddedLead[]): SearchRow[] {
  return [
    ...added.map((a) => ({ id: a.id, page: "leads" as const, name: a.name, sub: `${SOURCE_LABEL.you} · ${a.sub}`, href: "/leads" })),
    ...searchRows,
  ];
}
