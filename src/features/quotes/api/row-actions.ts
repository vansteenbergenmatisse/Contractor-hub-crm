import type { RowAction } from "@/features/app-shell";
import type { Quote } from "../types";
import { canApprove } from "./quotes";

export type QuoteRowHandlers = {
  filled: boolean;
  canUndo: boolean;
  onUndo: () => void;
  onSee: () => void;
  onApprove: () => void;
  onWon: () => void;
  onLost: () => void;
  onBuild: () => void;
  onUpload: () => void;
};

// A quote row's swipe and menu actions, as the design derives them from the row's shown buttons (logic
// `uxActs`, `uxItems`): every button in screen order with Lost last; a swipe right runs the filled
// button, else the first safe one ("See the quote"). A quote row has nothing to mark done, so a swipe
// left does nothing.
export function quoteRowActions(q: Quote, h: QuoteRowHandlers): RowAction[] {
  const fillApprove = canApprove(q) && h.filled;
  const out: RowAction[] = [];
  if (h.canUndo) out.push({ label: "Undo", onAction: h.onUndo });
  out.push({ label: "See the quote", onAction: h.onSee, ...(fillApprove ? {} : { swipe: "right" as const }) });
  if (canApprove(q)) out.push({ label: "Approve and send", onAction: h.onApprove, ...(fillApprove ? { swipe: "right" as const } : {}) });
  if (q.status === "sent") {
    out.push({ label: "Accepted", onAction: h.onWon });
    out.push({ label: "Lost", onAction: h.onLost, tone: "danger" });
  }
  if (q.status === "need") {
    out.push({ label: "Build quote", onAction: h.onBuild });
    out.push({ label: "Or upload your own quote", onAction: h.onUpload });
  }
  return out;
}
