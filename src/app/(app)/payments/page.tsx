import { Suspense } from "react";
import { hitRateLimit } from "@/features/auth";
import { createTenantBillingReaders } from "@/features/highlevel";
import { PaymentsLivePage, PaymentsSkeleton, isPaymentsPageLive, loadPayments } from "@/features/payments";
import { NotAvailablePage } from "@/shared/ui/not-available-page";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The signed-in tenant's payments. The tenant comes from the session only.
async function PaymentsData() {
  const user = await getRequestUser();
  const readers = user?.viewing ? createTenantBillingReaders(hitRateLimit, { viewerId: user.id }) : createTenantBillingReaders(hitRateLimit);
  const result = await loadPayments(user?.tenantId, readers);
  return <PaymentsLivePage result={result} />;
}

// Stays unavailable until the server flag is on. The flag is checked before any read.
export default function Page() {
  if (!isPaymentsPageLive()) return <NotAvailablePage title="Payments due" />;
  return (
    <Suspense fallback={<PaymentsSkeleton />}>
      <PaymentsData />
    </Suspense>
  );
}
