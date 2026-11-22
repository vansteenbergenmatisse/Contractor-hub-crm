import { Suspense } from "react";
import { InboxPageFromUrl } from "@/features/inbox";

// Thin page: the Inbox feature does the work. Suspense is for useSearchParams (?row=<id>).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <InboxPageFromUrl />
    </Suspense>
  );
}
