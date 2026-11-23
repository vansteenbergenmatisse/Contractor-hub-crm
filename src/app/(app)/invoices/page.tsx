import { Suspense } from "react";
import { hitRateLimit } from "@/features/auth";
import { createTenantBillingReaders } from "@/features/highlevel";
import { InvoicesLivePage, InvoicesSkeleton, isInvoicesPageLive, loadInvoices } from "@/features/invoices";
import { NotAvailablePage } from "@/shared/ui/not-available-page";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The signed-in tenant's invoices. The tenant comes from the session only.
async function InvoicesData() {
  const user = await getRequestUser();
  const readers = user?.viewing ? createTenantBillingReaders(hitRateLimit, { viewerId: user.id }) : createTenantBillingReaders(hitRateLimit);
  const result = await loadInvoices(user?.tenantId, readers.invoices);
  return <InvoicesLivePage result={result} />;
}

// Stays unavailable until the server flag is on. The flag is checked before any read.
export default function Page() {
  if (!isInvoicesPageLive()) return <NotAvailablePage title="Invoices" />;
  return (
    <Suspense fallback={<InvoicesSkeleton />}>
      <InvoicesData />
    </Suspense>
  );
}
