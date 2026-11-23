import { InvoicesSkeleton } from "@/features/invoices";

// Shown while Payments due loads: bars in place of any value.
export function PaymentsSkeleton() {
  return <InvoicesSkeleton title="Payments due" />;
}
