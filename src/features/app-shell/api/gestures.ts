import { focusables, isShown } from "./focus";

// The design's gesture layer (logic "UX round": uxSwipe, uxCtx, uxSheets, uxPull, uxEdge, uxSwipe2),
// as plain numbers and functions. The hooks in ../hooks/use-*-swipe.ts and use-row-gestures.ts use
// these; nothing here touches React.

// One thing a row can do. Pages pass these to `useRowGestures`. The same list is the row's menu
// (long press, right-click, ContextMenu key, Shift+F10) and, through `swipe`, its swipe actions.
// The design's menu and swipe strip show words only, so an action has no icon.
export type RowAction = {
  label: string;
  onAction: () => void;
  // "danger" sits last in the menu, after a separator, in red (design `uxBad`: Lost, Delete, Remove).
  tone?: "default" | "danger";
  // A full swipe right runs the row's main button; a swipe left marks it done or paid (design `uxActs`).
  swipe?: "right" | "left";
  // The word on the swipe strip when it differs from the menu's (design: "Reply" on the strip,
  // "Open conversation" in the menu). The menu always shows `label`.
  swipeLabel?: string;
};

// What the swipe strip (and the spoken "<word>. Done.") says for an action.
export const swipeText = (action: RowAction): string => action.swipeLabel || action.label;

// --- thresholds, straight from the design's logic
export const PHONE_MAX = 1023; // a phone is under 1024px wide (`uxPhone`)
export const EDGE_PX = 24; // a touch this close to the left edge belongs to the edge swipe
export const ROW_SWIPE = { cancelY: 10, startX: 12, ratio: 1.5, maxShare: 0.8, noActionMax: 28, goMax: 120, goShare: 0.4, snapMs: 180 } as const;
export const LONG_PRESS = { ms: 500, slop: 8, reopenGuardMs: 900 } as const;
export const SHEET_SWIPE = { grabZone: 44, start: 8, close: 90, grow: -60, maxShare: 0.92 } as const;
export const EDGE_SWIPE = { cancelY: 12, start: 10, go: 80, maxSlide: 160, slideRatio: 0.5, snapMs: 180 } as const;
export const H_SWIPE = { minX: 70, maxY: 40 } as const;
export const PULL = { cancelUp: -4, cancelX: 12, start: 10, ratio: 0.5, max: 96, ready: 60, busySlide: 56, busyMs: 800, doneMs: 900, slideMs: 260, autoMs: 60_000 } as const;
export const NO_CLICK_MS = 450;
export const SNAP_EASE = "cubic-bezier(.4,0,.2,1)";
export const SLIDE_EASE = "cubic-bezier(0,0,.2,1)";

export function isPhone(): boolean {
  try {
    return window.innerWidth <= PHONE_MAX;
  } catch {
    return false;
  }
}

// The design turns every move off with "reduce motion" (globals.css). The hooks also skip the inline
// snap-back transitions they set, so nothing animates even outside `.fd-app`.
export function reducedMotion(): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function snap(ms: number, ease = SNAP_EASE): string {
  return reducedMotion() ? "none" : `transform ${ms}ms ${ease}`;
}

// --- row swipe
export type SwipeFrame = { offset: number; go: boolean };

// Where the row sits for a finger `dx` px sideways, and whether letting go runs the action.
// With an action the row follows up to 80% of its width and runs past min(120px, 40%);
// without one it only gives 28px.
export function rowSwipeFrame(dx: number, width: number, hasAction: boolean): SwipeFrame {
  const limit = hasAction ? width * ROW_SWIPE.maxShare : ROW_SWIPE.noActionMax;
  const offset = Math.max(-limit, Math.min(limit, dx));
  return { offset, go: hasAction && Math.abs(offset) > Math.min(ROW_SWIPE.goMax, width * ROW_SWIPE.goShare) };
}

// "start" once the move is clearly sideways, "cancel" once it is clearly a scroll, else "wait".
export function rowSwipeIntent(dx: number, dy: number): "start" | "cancel" | "wait" {
  if (Math.abs(dy) > ROW_SWIPE.cancelY && Math.abs(dy) > Math.abs(dx)) return "cancel";
  if (Math.abs(dx) < ROW_SWIPE.startX || Math.abs(dx) < Math.abs(dy) * ROW_SWIPE.ratio) return "wait";
  return "start";
}

export function swipeActions(actions: readonly RowAction[]): { right: RowAction | null; left: RowAction | null } {
  return { right: actions.find((a) => a.swipe === "right") ?? null, left: actions.find((a) => a.swipe === "left") ?? null };
}

// --- menu
// Safe actions first, destructive ones last (design `uxItems`).
export function orderMenu(actions: readonly RowAction[]): RowAction[] {
  return actions.filter((a) => a.tone !== "danger").concat(actions.filter((a) => a.tone === "danger"));
}

// Keeps the menu on screen: a phone menu starts at the row's top-left (8 → 12px margin), a computer
// menu at the pointer.
export function menuPosition(
  at: { x: number; y: number },
  box: { width: number; height: number },
  view: { width: number; height: number },
  phone: boolean,
): { left: number; top: number } {
  const m = phone ? 12 : 8;
  return {
    left: Math.max(m, Math.min(at.x, view.width - m - box.width)),
    top: Math.max(m, Math.min(at.y, view.height - m - box.height)),
  };
}

// --- horizontal swipe (stage list, day strip)
export function horizontalSwipe(dx: number, dy: number): "left" | "right" | null {
  if (Math.abs(dx) < H_SWIPE.minX || Math.abs(dy) > H_SWIPE.maxY) return null;
  return dx < 0 ? "left" : "right";
}

// --- pull to refresh
export function pullDistance(dy: number): number {
  return Math.max(0, Math.min(PULL.max, dy * PULL.ratio));
}

export function updatedAgo(since: number, now: number): string {
  const m = Math.floor((now - since) / 60000);
  return m < 1 ? "Updated just now" : `Updated ${m} min ago`;
}

// --- sheets
// The design's phone sheets that close with a swipe down (`uxSheetOf`), apart from the menu drawer,
// which the shell wires on its own element.
export const SHEET_SELECTOR = ".fd-cf:not(.is-off) .fd-cfb, .fd-cdet.is-on, .fx-addp.is-sheet, .fd-cnew:not(.is-off)";

// True when a page sheet or a shell dialog other than `root` is open on screen. The design's Escape
// (logic `uxEsc`) closes those before the feedback sheet and the menu drawer, so the visible one
// closes first even when the drawer was opened after it and lies behind it.
export function sheetOnTop(root: Element | null): boolean {
  if (typeof document === "undefined") return false;
  return Array.from(document.querySelectorAll(SHEET_SELECTOR)).some(
    (el) => isShown(el) && !(root && (root.contains(el) || el.contains(root))),
  );
}

const clicked = (button: HTMLElement | null | undefined) => {
  if (!button) return false;
  press(button);
  return true;
};

// Closes a design sheet the way its own buttons do (design `uxSheetClose`): a stop's detail presses its
// close button, a send dialog that shows the document goes Back, every other sheet presses its last
// visible Cancel. Returns false when the sheet had nothing to press.
export function pressSheetClose(sheet: HTMLElement): boolean {
  if (sheet.classList.contains("fd-cdet")) return clicked(sheet.querySelector<HTMLElement>(".fd-dx"));
  if (sheet.closest(".fd-dg.is-view")) return clicked(sheet.querySelector<HTMLElement>(".fd-aback"));
  const cancels = Array.from(sheet.querySelectorAll<HTMLButtonElement>("button")).filter(
    (b) => isShown(b) && /^cancel$/i.test(label(b)),
  );
  return clicked(cancels.pop());
}

export function clearSheetStyle(sheet: HTMLElement): void {
  sheet.style.maxHeight = "";
  sheet.style.height = "";
  sheet.style.transform = "";
  sheet.style.transition = "";
}

// --- back button for the edge swipe (design `uxBackBtn`)
export const BACK_SELECTOR = ".fd-tback, .fd-sback, .fd-aback, .fx-stback";

export function findBack(view: ParentNode | null): HTMLElement | null {
  if (!view) return null;
  return Array.from(view.querySelectorAll<HTMLElement>(BACK_SELECTOR)).find((b) => isShown(b)) ?? null;
}

export function label(el: Element): string {
  return String(el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
}

// Where focus goes back to when a row's menu closes: the row itself when it can take focus, else its
// first button (design `uxClose`).
export function rowFocusTarget(row: HTMLElement): HTMLElement | null {
  if (row.matches("button, a[href], input, select, textarea") || row.hasAttribute("tabindex")) return row;
  return focusables(row)[0] ?? null;
}

// --- a click right after a swipe or a long press does not also press the row (design `uxNoClick`)
let noClick: { t: number; el: Element } | null = null;
let listening = false;
let pass = false;

// Presses a button for a gesture (design `uxPress`); never swallowed by `suppressClick`.
export function press(button: HTMLElement): void {
  pass = true;
  try {
    button.click();
  } finally {
    pass = false;
  }
}

export function suppressClick(el: Element, now = Date.now()): void {
  noClick = { t: now, el };
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener(
    "click",
    (event) => {
      const n = noClick;
      if (pass || !n || Date.now() - n.t > NO_CLICK_MS || !(event.target instanceof Node) || !n.el.contains(event.target)) return;
      event.stopPropagation();
      event.preventDefault();
    },
    true,
  );
}

export function clearSuppressedClick(): void {
  noClick = null;
}

// Reads one touch point; undefined when the event carries none.
export function point(event: TouchEvent, changed = false): { x: number; y: number } | undefined {
  const t = (changed ? event.changedTouches : event.touches)?.[0];
  return t ? { x: t.clientX, y: t.clientY } : undefined;
}
