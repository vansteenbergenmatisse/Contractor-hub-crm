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

// The class of the wrapper around a page: the slide-in only on entrance, and `is-thru`
// (display: contents on a phone) while an Inbox conversation is open, so its reply box sits at the bottom.
export function viewClass(page: PageKey, pushed: boolean, entered: boolean): string {
  return `fd-view${entered ? "" : " is-nav-a"}${page === "inbox" && pushed ? " is-thru" : ""}`;
}
