import type { SearchRow } from "../types";

export const SEARCH_GROUPS: ReadonlyArray<{ key: SearchRow["page"]; title: string }> = [
  { key: "leads", title: "Leads" },
  { key: "pipeline", title: "Pipeline" },
  { key: "quotes", title: "Quotes" },
  { key: "invoices", title: "Invoices" },
  { key: "payments", title: "Payments due" },
  { key: "inbox", title: "Messages" },
];

// 4 starts with the term, 3 a word starts with it, 2 the name holds it, 1 only the sub line does.
export function scoreRow(row: SearchRow, term: string): number {
  const t = term.trim().toLowerCase();
  if (!t) return 0;
  const name = row.name.toLowerCase();
  if (name.startsWith(t)) return 4;
  if (` ${name}`.includes(` ${t}`)) return 3;
  if (name.includes(t)) return 2;
  return `${name} ${row.sub}`.toLowerCase().includes(t) ? 1 : 0;
}

export type SearchGroup = { key: SearchRow["page"]; title: string; hits: SearchRow[]; total: number };

// Grouped, best first. With scope "all" each group shows at most 4; a scope shows every hit.
export function searchRows(rows: readonly SearchRow[], term: string, scope: "all" | SearchRow["page"]): SearchGroup[] {
  if (!term.trim()) return [];
  const out: SearchGroup[] = [];
  for (const group of SEARCH_GROUPS) {
    if (scope !== "all" && scope !== group.key) continue;
    const hits = rows
      .filter((row) => row.page === group.key)
      .map((row) => ({ row, score: scoreRow(row, term) }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((hit) => hit.row);
    if (hits.length === 0) continue;
    out.push({ key: group.key, title: group.title, hits: scope === "all" ? hits.slice(0, 4) : hits, total: hits.length });
  }
  return out;
}

// Recent searches: newest first, no duplicates (case blind), at most 5.
export function pushRecent(recent: readonly string[], term: string): string[] {
  const t = term.trim();
  if (!t) return [...recent];
  return [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 5);
}
