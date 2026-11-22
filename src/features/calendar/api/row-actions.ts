import type { RowAction } from "@/features/app-shell";

export type StopRowHandlers = {
  onOpen: () => void;
  onReschedule: () => void;
  onDelete: () => void;
};

// A stop's long-press, right-click and menu-key menu (design logic `uxItems`): a past stop can only be
// opened; any other stop can be opened, rescheduled or deleted. No action has a swipe: stops do not swipe.
export function stopRowActions(past: boolean, h: StopRowHandlers): RowAction[] {
  if (past) return [{ label: "Open", onAction: h.onOpen }];
  return [
    { label: "Open", onAction: h.onOpen },
    { label: "Reschedule", onAction: h.onReschedule },
    { label: "Delete", onAction: h.onDelete, tone: "danger" },
  ];
}
