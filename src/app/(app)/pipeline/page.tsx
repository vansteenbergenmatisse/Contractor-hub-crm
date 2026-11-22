import { Suspense } from "react";
import { PipelinePage } from "@/features/pipeline";

// Thin page: the feature draws everything. The shell adds the page container. Suspense is for
// useSearchParams (?row= from the search).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PipelinePage />
    </Suspense>
  );
}
