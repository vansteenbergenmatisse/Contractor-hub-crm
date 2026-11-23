import type { SearchRow } from "@/features/app-shell";
import { joinParts } from "@/shared/lib/join-parts";
import type { AddedLead, Lead } from "../types";
import { SOURCE_LABEL, rowWhen } from "./leads-logic";

// The search row of each loaded lead. Each opens the Leads page.
export function leadSearchRows(leads: readonly Lead[]): SearchRow[] {
  return leads.map((l) => ({
    id: l.id,
    page: "leads",
    name: l.name,
    sub: joinParts([l.source ? SOURCE_LABEL[l.source] : "", l.need, l.address, rowWhen(l)]),
    href: "/leads",
  }));
}

// The rows of what Leads shows now: the hand-added leads on top (as the list draws them), then the
// loaded leads. The page hands these to the shell's search.
export function liveSearchRows(added: readonly AddedLead[], leads: readonly Lead[] = []): SearchRow[] {
  return [
    ...added.map((a) => ({ id: a.id, page: "leads" as const, name: a.name, sub: `${SOURCE_LABEL.you} · ${a.sub}`, href: "/leads" })),
    ...leadSearchRows(leads),
  ];
}
