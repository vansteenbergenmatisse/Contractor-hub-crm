"use client";

import { useBusiness, useBusinessValues } from "@/features/app-shell";
import { useNow } from "../hooks/use-now";
import type { CalendarBusiness } from "../types";
import { CalendarBoard } from "./CalendarBoard";
import { CalendarHeader } from "./CalendarHeader";

// The Calendar page content. The shell adds the `fd-view` wrapper, the top bars and the tab bar.
// `now` is for tests; the page otherwise reads the visitor's clock on the client. `business` (tests)
// overrides the signed-in business's booking link, website and hours.
export function CalendarPage({ now, business }: { now?: Date; business?: CalendarBusiness }) {
  const biz = useBusiness();
  const values = useBusinessValues();
  const own: CalendarBusiness = business ?? {
    bookingJobUrl: biz.bookingJobUrl,
    business_website_url: values.business_website_url,
    business_hours: values.business_hours,
  };
  const clock = useNow(now);
  if (!clock) {
    return (
      <div className="fd-cal">
        <CalendarHeader />
      </div>
    );
  }
  return <CalendarBoard now={clock} business={own} />;
}
