"use client";

import { MOCK_BUSINESS } from "@/shared/mock/business";
import { useNow } from "../hooks/use-now";
import type { CalendarBusiness } from "../types";
import { CalendarBoard } from "./CalendarBoard";
import { CalendarHeader } from "./CalendarHeader";

// The Calendar page content. The shell adds the `fd-view` wrapper, the top bars and the tab bar.
// `now` is for tests; the page otherwise reads the visitor's clock on the client. `business` is
// mock in Phase 2 (website for the booking link, opening hours).
export function CalendarPage({ now, business = MOCK_BUSINESS }: { now?: Date; business?: CalendarBusiness }) {
  const clock = useNow(now);
  if (!clock) {
    return (
      <div className="fd-cal">
        <CalendarHeader />
      </div>
    );
  }
  return <CalendarBoard now={clock} business={business} />;
}
