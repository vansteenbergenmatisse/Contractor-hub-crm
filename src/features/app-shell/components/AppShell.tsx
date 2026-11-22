"use client";

import { useState, type ReactNode } from "react";
import type { Business, SearchRow } from "../types";
import { GestureLayer } from "./GestureLayer";
import { ShellFrame } from "./ShellFrame";

type ShellProps = { business: Business; searchRows: readonly SearchRow[]; initialInboxCount?: number; children: ReactNode };

// The signed-in frame: side menu on a computer, top bar, floating tab bar and a menu drawer on a
// phone, the page action bar, and the shared pop-ups. Pages render inside it as `children`.
// The gesture layer (row swipes and menus, sheet swipe-down, left-edge swipe, pull to refresh) wraps
// the frame, so the frame's own gesture hooks and every page's reach it.
export function AppShell(props: ShellProps) {
  // A polite spoken line (design `uxSay`), e.g. "Undone." after ⌘Z or "Call. Done." after a swipe.
  const [said, setSaid] = useState("");
  return (
    <GestureLayer onSay={setSaid}>
      <ShellFrame {...props} said={said} onSay={setSaid} />
    </GestureLayer>
  );
}
