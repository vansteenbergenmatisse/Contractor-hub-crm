import type { PageKey } from "./types";

// Routes and menu order in one place. `/` is Today.
export const PAGE_PATH: Record<PageKey, string> = {
  today: "/", inbox: "/inbox", calendar: "/calendar", pipeline: "/pipeline", leads: "/leads",
  quotes: "/quotes", invoices: "/invoices", payments: "/payments", automations: "/automations", settings: "/settings",
};

export const PAGE_TITLE: Record<PageKey, string> = {
  today: "Today", inbox: "Inbox", calendar: "Calendar", pipeline: "Pipeline", leads: "Leads",
  quotes: "Quotes", invoices: "Invoices", payments: "Payments due", automations: "Automations", settings: "Settings",
};

// Side menu groups, as in the design.
export const MENU_GROUPS: ReadonlyArray<{ title: string; pages: readonly PageKey[] }> = [
  { title: "Overview", pages: ["today", "inbox", "calendar"] },
  { title: "Sales", pages: ["pipeline", "leads", "quotes"] },
  { title: "Money", pages: ["invoices", "payments"] },
  { title: "System", pages: ["automations"] },
];

// The phone tab bar; the fifth tab is More, which opens the menu.
export const TAB_PAGES: readonly PageKey[] = ["today", "pipeline", "inbox", "calendar"];

export function pageFromPath(path: string): PageKey {
  const hit = (Object.keys(PAGE_PATH) as PageKey[]).find((k) => k !== "today" && (path === PAGE_PATH[k] || path.startsWith(`${PAGE_PATH[k]}/`)));
  return hit ?? "today";
}
