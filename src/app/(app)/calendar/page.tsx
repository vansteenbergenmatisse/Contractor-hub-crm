import { Suspense } from "react";
import { CalendarPageFromUrl } from "@/features/calendar";

// Thin page: the Calendar feature does the work. Suspense is for useSearchParams (?row=<id>).
export default function Page() {
  return (
    <Suspense fallback={null}>
      <CalendarPageFromUrl />
    </Suspense>
  );
}
