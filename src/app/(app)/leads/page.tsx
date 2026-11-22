import { Suspense } from "react";
import { LeadsPage } from "@/features/leads";

// Thin page: the Leads feature does the work. Suspense is for useSearchParams (?add=1).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LeadsPage />
    </Suspense>
  );
}
