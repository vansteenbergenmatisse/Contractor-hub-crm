// The design's keyboard shortcuts on a computer (design logic `uxKeys`, `uxHelp`, `uxArrow`).
import { isShown } from "./focus";

export type ShortcutAction = "search" | "help" | "settings" | "newLead" | "undo" | "escape" | "rowDown" | "rowUp" | null;

type KeyLike = { key: string; code?: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean };

// Which shortcut a key press is. `typing` is true while focus is in a text field: there ⌘Z and the
// arrows keep their usual meaning.
export function shortcutFor(event: KeyLike, typing: boolean): ShortcutAction {
  const { key } = event;
  const mod = event.metaKey || event.ctrlKey;
  if (mod && !event.altKey && (key === "f" || key === "F")) return "search";
  if (mod && (key === "?" || key === "/")) return "help";
  if (mod && !event.altKey && key === ",") return "settings";
  if (mod && event.altKey && event.code === "KeyN") return "newLead";
  if (mod && !event.shiftKey && !event.altKey && (key === "z" || key === "Z")) return typing ? null : "undo";
  if (key === "Escape") return "escape";
  if ((key === "ArrowDown" || key === "ArrowUp") && !typing && !mod && !event.altKey) return key === "ArrowDown" ? "rowDown" : "rowUp";
  return null;
}

// True for a key press that lands in a text field.
export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable === true;
}

export function detectMac(): boolean {
  try {
    return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
  } catch {
    return true;
  }
}

// The shortcut list, in the design's order and words.
export function helpRows(mac: boolean): ReadonlyArray<readonly [string, string]> {
  const c = mac ? "⌘" : "Ctrl ";
  const o = mac ? "⌥" : "Alt ";
  return [
    [`${c}F`, "Search customers, quotes and invoices"],
    [`${c}Z`, "Undo the last change on this page"],
    [`${c},`, "Open Settings"],
    [`${o}${c}N`, "Add a new lead"],
    ["↑ ↓", "Move between rows"],
    [mac ? "Return" : "Enter", "Press the selected row or button"],
    ["Esc", "Close a sheet, a menu or a panel"],
    [`${c}?`, "Show these shortcuts"],
  ];
}

// The rows the arrows move between (design `uxRows`).
export const ROW_SELECTOR = ".fd-crs > .fd-cr, .fd-lst > .fd-rw, .fd-need .fd-rows > li";

const labelOf = (el: Element): string => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();

// The Undo button on screen in `view` (a label that starts with "Undo"), or null (design ⌘Z).
export function findUndo(view: ParentNode | null): HTMLButtonElement | null {
  if (!view) return null;
  return Array.from(view.querySelectorAll<HTMLButtonElement>("button")).find((b) => /^undo/i.test(labelOf(b)) && !b.disabled && isShown(b)) ?? null;
}

// Arrow Up/Down from inside a row: focus the next or previous row on screen (the row itself when it
// is a button, else its first button). Returns true when focus moved.
export function moveRow(target: EventTarget | null, step: 1 | -1): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function" || el.closest(".fd-wsb, #fx, .fd-stsec, .fd-st2")) return false;
  const row = el.closest(ROW_SELECTOR);
  if (!row || !row.parentElement) return false;
  const rows = Array.from(row.parentElement.children).filter((r) => r.matches(ROW_SELECTOR) && isShown(r));
  const next = rows[rows.indexOf(row) + step];
  if (!next) return false;
  const to = next.matches("button")
    ? (next as HTMLButtonElement)
    : Array.from(next.querySelectorAll<HTMLButtonElement>("button")).find((b) => !b.hasAttribute("data-fx-noact") && !b.disabled && isShown(b));
  if (!to) return false;
  to.focus();
  return true;
}
