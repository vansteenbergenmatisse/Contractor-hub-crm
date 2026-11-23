import { Suspense } from "react";
import { hitRateLimit } from "@/features/auth";
import { createTenantEstimatesReader } from "@/features/highlevel";
import { QuotesLivePage, QuotesSkeleton, isQuotesPageLive, loadQuotes } from "@/features/quotes";
import { NotAvailablePage } from "@/shared/ui/not-available-page";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The signed-in tenant's quotes. The tenant comes from the session only.
async function QuotesData() {
  const user = await getRequestUser();
  const reader = user?.viewing ? createTenantEstimatesReader(hitRateLimit, { viewerId: user.id }) : createTenantEstimatesReader(hitRateLimit);
  const result = await loadQuotes(user?.tenantId, reader);
  return <QuotesLivePage result={result} />;
}

// Stays unavailable until the server flag is on. The flag is checked before any read.
export default function Page() {
  if (!isQuotesPageLive()) return <NotAvailablePage title="Quotes" />;
  return (
    <Suspense fallback={<QuotesSkeleton />}>
      <QuotesData />
    </Suspense>
  );
}
