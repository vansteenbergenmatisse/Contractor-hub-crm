import { Suspense } from "react";
import { hitRateLimit } from "@/features/auth";
import { createTenantInboxReader } from "@/features/highlevel";
import { InboxLivePage, InboxSkeleton, loadInbox } from "@/features/inbox";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;

// The signed-in tenant's conversations, read-only. The tenant comes from the session only.
async function InboxData({ searchParams }: { searchParams?: Params }) {
  const user = await getRequestUser();
  const row = (await searchParams)?.row;
  const reader = user?.viewing ? createTenantInboxReader(hitRateLimit, { viewerId: user.id }) : createTenantInboxReader(hitRateLimit);
  const result = await loadInbox(user?.tenantId, reader, typeof row === "string" ? row : null);
  return <InboxLivePage result={result} />;
}

// Thin page. Suspense covers the data.
export default function Page({ searchParams }: { searchParams?: Params } = {}) {
  return (
    <Suspense fallback={<InboxSkeleton />}>
      <InboxData searchParams={searchParams} />
    </Suspense>
  );
}
