import { Suspense } from "react";
import { hitRateLimit } from "@/features/auth";
import { AutomationsLivePage, isAutomationsPageLive, loadAutomations } from "@/features/automations";
import { createTenantWorkflowsReader } from "@/features/highlevel";
import { NotAvailablePage } from "@/shared/ui/not-available-page";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The signed-in tenant's automations. The tenant comes from the session only.
async function AutomationsData() {
  const user = await getRequestUser();
  const reader = user?.viewing ? createTenantWorkflowsReader(hitRateLimit, { viewerId: user.id }) : createTenantWorkflowsReader(hitRateLimit);
  const result = await loadAutomations(user?.tenantId, reader);
  return <AutomationsLivePage result={result} />;
}

// Stays unavailable until the server flag is on. The flag is checked before any read.
export default function Page() {
  if (!isAutomationsPageLive()) return <NotAvailablePage title="Automations" />;
  return (
    <Suspense fallback={null}>
      <AutomationsData />
    </Suspense>
  );
}
