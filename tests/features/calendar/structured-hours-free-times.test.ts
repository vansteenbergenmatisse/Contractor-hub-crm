// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => null,
}));

import { buildBrand, businessFromBrand } from "@/features/brand";
import { liveFreeTimes, loadCalendar, type CalendarResult } from "@/features/calendar";

// All values are fake. Wednesday March 4, 2026, 12:00 in New York.
const ZONE = "America/New_York";
const NOW = new Date("2026-03-04T17:00:00.000Z");
const emptyWeek = () =>
  loadCalendar("t", null, async (_t, boundsFor) => ({
    ok: true as const, timeZone: ZONE, range: boundsFor(ZONE)!, calendarCount: 1, events: [], dropped: 0, complete: true,
  }), () => NOW) as Promise<Extract<CalendarResult, { state: "ready" | "empty" }>>;
const business = (values: Record<string, string>) =>
  businessFromBrand(buildBrand(Object.entries(values).map(([key, value]) => ({ key, value }))), "Owner");

const goodWeekdays = { business_hours_weekdays_open: "08:00", business_hours_weekdays_close: "17:00" };
const badWeekdays = { business_hours_weekdays_open: "8am", business_hours_weekdays_close: "17:00" };
const saturday = { business_hours_saturday_open: "09:00", business_hours_saturday_close: "13:00" };
const closedWeekend = {
  business_hours_saturday_open: "closed", business_hours_saturday_close: "closed",
  business_hours_sunday_open: "closed", business_hours_sunday_close: "closed",
};

describe("free times from structured hours", () => {
  it("offers nothing when the weekdays are malformed and Saturday is valid", async () => {
    const shop = business({ ...badWeekdays, ...saturday });
    expect(liveFreeTimes(await emptyWeek(), shop, NOW)).toEqual({ state: "no-hours" });
  });

  it("does not call a week full when the weekdays are malformed and the weekend is closed", async () => {
    const shop = business({ ...badWeekdays, ...closedWeekend });
    expect(liveFreeTimes(await emptyWeek(), shop, NOW)).toEqual({ state: "no-hours" });
  });

  it("offers nothing when a day has only one of its two values", async () => {
    const shop = business({ ...goodWeekdays, business_hours_saturday_open: "09:00" });
    expect(liveFreeTimes(await emptyWeek(), shop, NOW)).toEqual({ state: "no-hours" });
  });

  it("offers nothing when a day's values contradict each other", async () => {
    const shop = business({ ...goodWeekdays, business_hours_sunday_open: "10:00", business_hours_sunday_close: "closed" });
    expect(liveFreeTimes(await emptyWeek(), shop, NOW)).toEqual({ state: "no-hours" });
  });

  it("still offers times when valid days are set and the others are simply empty", async () => {
    const shop = business(goodWeekdays);
    expect(liveFreeTimes(await emptyWeek(), shop, NOW).state).toBe("open");
  });

  it("uses a readable business_hours line, whatever the structured values hold", async () => {
    const shop = business({ business_hours: "Mon - Fri: 8:00 AM - 5:00 PM", ...badWeekdays });
    expect(liveFreeTimes(await emptyWeek(), shop, NOW).state).toBe("open");
  });

  it("keeps showing the readable part of the hours as text", () => {
    expect(business({ ...badWeekdays, ...saturday }).hours).toBe("Sat: 9:00 AM - 1:00 PM");
  });
});
