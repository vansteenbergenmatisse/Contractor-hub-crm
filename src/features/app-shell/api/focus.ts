import type { PageKey } from "../types";

type Focusable = { focus: (options?: FocusOptions) => void; isConnected?: boolean };

// Remembers the element that opened a sheet and gives focus back to it on close (once).
export function createFocusReturn() {
  let back: Focusable | null = null;
  return {
    remember(element: unknown) {
      back = element && typeof (element as Focusable).focus === "function" ? (element as Focusable) : null;
    },
    restore() {
      const element = back;
      back = null;
      if (element && element.isConnected !== false) element.focus();
    },
    forget() {
      back = null;
    },
  };
}

// True when an element is on screen: not inside a part the design hides by class (`is-off`,
// `fd-hid`), not `hidden`, `inert` or aria-hidden, and visible to the browser's own check.
export function isShown(element: Element): boolean {
  if (element.closest(".is-off, .fd-hid, [hidden], [inert], [aria-hidden='true']")) return false;
  const check = (element as Element & { checkVisibility?: (options?: { visibilityProperty?: boolean }) => boolean }).checkVisibility;
  return typeof check === "function" ? check.call(element, { visibilityProperty: true }) : true;
}

const FOCUSABLE = "button, input, textarea, select, a[href], [tabindex]";

// The elements Tab can reach inside `root`, in page order.
export function focusables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && isShown(el),
  );
}

// Keeps Tab inside an open sheet: moves focus to the next (Shift: previous) item and wraps at both
// ends. Returns true when it handled the key (the caller then stops the browser's own move).
export function trapFocus(event: { key: string; shiftKey: boolean; preventDefault: () => void }, root: ParentNode | null): boolean {
  if (event.key !== "Tab" || !root) return false;
  const items = focusables(root);
  event.preventDefault();
  if (items.length === 0) return true;
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next = at < 0 ? (event.shiftKey ? items.length - 1 : 0) : (at + (event.shiftKey ? items.length - 1 : 1)) % items.length;
  items[next].focus();
  return true;
}

// The class of the wrapper around a page: the slide-in only on entrance, and `is-thru`
// (display: contents on a phone) while an Inbox conversation is open, so its reply box sits at the bottom.
export function viewClass(page: PageKey, pushed: boolean, entered: boolean): string {
  return `fd-view${entered ? "" : " is-nav-a"}${page === "inbox" && pushed ? " is-thru" : ""}`;
}
