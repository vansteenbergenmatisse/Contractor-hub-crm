import { Suspense } from "react";
import { hitRateLimit } from "@/features/auth";
import { createTenantPipelineReader } from "@/features/highlevel";
import { LivePipelinePage, LivePipelineSkeleton, loadPipeline } from "@/features/pipeline";
import { getRequestUser } from "../../session";

export const dynamic = "force-dynamic";

type Search = Promise<{ pipeline?: string | string[] }>;

// The signed-in tenant's board. The tenant comes from the session only; `pipeline` only picks among
// that tenant's own pipelines. An admin's client view reads without refreshing the client's token.
async function PipelineData({ searchParams }: { searchParams: Search }) {
  const [user, { pipeline }] = await Promise.all([getRequestUser(), searchParams]);
  const read = user?.viewing ? createTenantPipelineReader(hitRateLimit, { viewerId: user.id }) : createTenantPipelineReader(hitRateLimit);
  const result = await loadPipeline(user?.tenantId, read, typeof pipeline === "string" ? pipeline : undefined);
  return <LivePipelinePage result={result} />;
}

export default function Page({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<LivePipelineSkeleton />}>
      <PipelineData searchParams={searchParams} />
    </Suspense>
  );
}
