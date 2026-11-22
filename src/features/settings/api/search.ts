import type { SearchFilter, SectionKey } from "../types";
import { COLOR_GROUPS, CONNECTIONS, ESSENTIAL_FIELDS, SECTIONS, SOON_ITEMS, SWITCHES, labelOfKey } from "./fields";

type Item = { id: string; section: SectionKey; text: string };

function allItems(extra: readonly string[] = []): Item[] {
  const items: Item[] = [];
  for (const f of ESSENTIAL_FIELDS) items.push({ id: `cv-${f.key}`, section: "biz", text: `${f.label} custom_values.${f.key}` });
  for (const k of extra) items.push({ id: `cv-${k}`, section: "biz", text: `${labelOfKey(k)} custom_values.${k}` });
  for (const g of COLOR_GROUPS) for (const f of g.fields) items.push({ id: `cv-${f.key}`, section: "colors", text: `${f.label} custom_values.${f.key}` });
  CONNECTIONS.forEach((c, i) => items.push({ id: `conn-${i}`, section: "conn", text: `${c.name} ${c.sub}` }));
  SWITCHES.forEach((s, i) => items.push({ id: `sw-${i}`, section: "choice", text: s }));
  SOON_ITEMS.forEach((s, i) => items.push({ id: `soon-${i}`, section: "soon", text: s }));
  return items;
}

// Pure filter for the Settings search. A row shows when its text holds the query. A section whose
// title holds the query keeps all its rows. A section shows when its title or any row matches.
export function filterSettings(query: string, extra: readonly string[] = []): SearchFilter {
  const q = query.trim().toLowerCase();
  const sections = { biz: true, colors: true, conn: true, choice: true, soon: true } as Record<SectionKey, boolean>;
  const items: Record<string, boolean> = {};
  if (!q) {
    for (const it of allItems(extra)) items[it.id] = true;
    return { active: false, any: true, sections, items };
  }
  const titleHit = (k: SectionKey) => (SECTIONS.find((s) => s.key === k)?.title ?? "").toLowerCase().includes(q);
  for (const s of SECTIONS) sections[s.key] = false;
  for (const it of allItems(extra)) {
    const ok = titleHit(it.section) || it.text.toLowerCase().includes(q);
    items[it.id] = ok;
    if (ok) sections[it.section] = true;
  }
  return { active: true, any: Object.values(sections).some(Boolean), sections, items };
}
