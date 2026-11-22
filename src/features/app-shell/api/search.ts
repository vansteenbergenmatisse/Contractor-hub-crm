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

// The matched part of a result name, for <mark>: [before, match, after], or null when only the sub
// line matched or the term is blank.
export function highlight(name: string, term: string): [string, string, string] | null {
  const t = term.trim().toLowerCase();
  if (!t) return null;
  const at = name.toLowerCase().indexOf(t);
  if (at < 0) return null;
  return [name.slice(0, at), name.slice(at, at + t.length), name.slice(at + t.length)];
}

export type SearchPlacement = { phone: true } | { phone: false; left: number; top: number; width: number };

// Below 1024px search is a full-screen sheet (`is-ph`). On a computer it sits under the top Search
// field: width min(600, w - 32), right edge on the field's right edge, kept 16px from both sides,
// top on the field's top. With no field on screen: centred, 72px down.
export function searchPlacement(innerWidth: number, anchor: { top: number; right: number } | null): SearchPlacement {
  if (innerWidth < 1024) return { phone: true };
  const width = Math.min(600, innerWidth - 32);
  if (!anchor) return { phone: false, left: (innerWidth - width) / 2, top: 72, width };
  return { phone: false, left: Math.max(16, Math.min(anchor.right - width, innerWidth - 16 - width)), top: anchor.top, width };
}

// Left and Right move between the scope chips (and wrap); other keys give null.
export function nextScope<K extends string>(keys: readonly K[], current: K, key: string): K | null {
  const n = keys.length;
  const i = keys.indexOf(current);
  if (key === "ArrowRight") return keys[(i + 1) % n];
  if (key === "ArrowLeft") return keys[(i + n - 1) % n];
  return null;
}

// Tab inside a dialog: which of `count` focusable items to focus instead of the browser's choice,
// or null to let the browser move. `index` is the focused item, -1 when focus is outside.
export function trapTab(index: number, count: number, shift: boolean): number | null {
  if (count === 0) return null;
  if (index < 0) return shift ? count - 1 : 0;
  if (shift && index === 0) return count - 1;
  if (!shift && index === count - 1) return 0;
  return null;
}

// The link a search result opens: its page plus `row=<id>`, which `useRowFocus` on that page reads.
// A page that does not use the hook ignores the parameter.
export function rowHref(row: SearchRow): string {
  return `${row.href}${row.href.includes("?") ? "&" : "?"}row=${encodeURIComponent(row.id)}`;
}

// Sent on `window` (detail: the row id) each time a search result is opened, so a page already
// showing `?row=<id>` flashes the row again when the same result is picked twice.
export const ROW_PICK_EVENT = "fx:row-pick";

// The `row` id in a location search string ("?row=..."), or null.
export function rowParam(search: string): string | null {
  return new URLSearchParams(search).get("row") || null;
}

// The keyboard hint under the results on a computer.
export const shortcutHint = (isMac: boolean): string => (isMac ? "⌘?" : "Ctrl ?");

// The box of the `.fx-flash` ring over a found row.
export function flashStyle(rect: { left: number; top: number; width: number; height: number }) {
  return { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` };
}
