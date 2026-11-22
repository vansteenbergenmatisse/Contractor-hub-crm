import type { RowAction } from "@/features/app-shell";
import type { Invoice } from "../types";

export type InvoiceRowHandlers = {
  filled: boolean;
  onView: () => void;
  onSend: () => void;
  onPaid: () => void;
  onMake: () => void;
};

// An invoice row's swipe and menu actions, as the design derives them from the row's shown buttons
// (logic `uxActs`, `uxItems`): every shown button in screen order; a swipe right runs the filled
// "Send invoice", else "View"; a swipe left runs "Mark paid" when the invoice is out.
export function invoiceRowActions(inv: Invoice, h: InvoiceRowHandlers): RowAction[] {
  const fillSend = inv.st === "ready" && h.filled;
  const out: RowAction[] = [{ label: "View", onAction: h.onView, ...(fillSend ? {} : { swipe: "right" as const }) }];
  if (inv.st === "ready") out.push({ label: "Send invoice", onAction: h.onSend, ...(fillSend ? { swipe: "right" as const } : {}) });
  if (inv.st === "sent") out.push({ label: "Mark paid", onAction: h.onPaid, swipe: "left" });
  if (inv.st === "need") out.push({ label: "Make invoice", onAction: h.onMake });
  return out;
}
