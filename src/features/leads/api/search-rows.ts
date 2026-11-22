import type { SearchRow } from "@/features/app-shell";
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
