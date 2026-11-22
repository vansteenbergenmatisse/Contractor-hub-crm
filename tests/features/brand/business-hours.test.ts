import { describe, expect, it } from "vitest";
import { buildBrand } from "@/features/brand";

// Key names are the real custom value keys (docs/tenant-branding.md); every value is made up.
const hours = (values: Record<string, string>) =>
  buildBrand(Object.entries(values).map(([key, value]) => ({ key, value }))).profile.hours;

const weekdays = { business_hours_weekdays_open: "08:00", business_hours_weekdays_close: "17:00" };
const saturday = { business_hours_saturday_open: "09:00", business_hours_saturday_close: "13:30" };
const sunday = { business_hours_sunday_open: "10:00", business_hours_sunday_close: "14:00" };

describe("business hours from the structured keys", () => {
  it("lets business_hours win when it is set", () => {
    expect(hours({ business_hours: "Open 24/7", ...weekdays })).toBe("Open 24/7");
  });

  it("builds a line in the design's wording when business_hours is empty or blank", () => {
    expect(hours({ ...weekdays, ...saturday, ...sunday })).toBe(
      "Mon - Fri: 8:00 AM - 5:00 PM, Sat: 9:00 AM - 1:30 PM, Sun: 10:00 AM - 2:00 PM",
    );
    expect(hours({ business_hours: "   ", ...weekdays })).toBe("Mon - Fri: 8:00 AM - 5:00 PM");
  });

  it("joins neighbouring days with the same hours", () => {
    const sameSaturday = { business_hours_saturday_open: "08:00", business_hours_saturday_close: "17:00" };
    expect(hours({ ...weekdays, ...sameSaturday })).toBe("Mon - Sat: 8:00 AM - 5:00 PM");
    expect(hours({
      ...saturday, business_hours_sunday_open: "09:00", business_hours_sunday_close: "13:30",
    })).toBe("Sat - Sun: 9:00 AM - 1:30 PM");
  });

  it("does not join weekdays and Sunday across a missing Saturday", () => {
    const sameSunday = { business_hours_sunday_open: "08:00", business_hours_sunday_close: "17:00" };
    expect(hours({ ...weekdays, ...sameSunday })).toBe("Mon - Fri: 8:00 AM - 5:00 PM, Sun: 8:00 AM - 5:00 PM");
  });

  it("formats midnight and noon", () => {
    expect(hours({ business_hours_weekdays_open: "00:00", business_hours_weekdays_close: "12:00" }))
      .toBe("Mon - Fri: 12:00 AM - 12:00 PM");
  });

  it("leaves out a day with a missing or malformed value", () => {
    for (const bad of ["", "8:00", "24:00", "12:60", "9am", "08:00:00", "<b>08:00</b>"]) {
      expect(hours({ ...weekdays, business_hours_saturday_open: bad, business_hours_saturday_close: "13:00" }))
        .toBe("Mon - Fri: 8:00 AM - 5:00 PM");
    }
    expect(hours({ ...weekdays, business_hours_sunday_open: "10:00" })).toBe("Mon - Fri: 8:00 AM - 5:00 PM");
  });

  it("says Closed only when a value says so", () => {
    expect(hours({ ...weekdays, business_hours_sunday_open: "Closed", business_hours_sunday_close: "closed" }))
      .toBe("Mon - Fri: 8:00 AM - 5:00 PM, Sun: Closed");
    expect(hours({ ...weekdays, business_hours_sunday_open: " CLOSED " })).toBe("Mon - Fri: 8:00 AM - 5:00 PM, Sun: Closed");
    expect(hours(weekdays)).not.toContain("Closed");
  });

  it("leaves out a day whose values contradict each other", () => {
    expect(hours({ ...weekdays, business_hours_sunday_open: "10:00", business_hours_sunday_close: "closed" }))
      .toBe("Mon - Fri: 8:00 AM - 5:00 PM");
  });

  it("shows nothing when no day is usable", () => {
    expect(hours({})).toBeNull();
    expect(hours({ business_hours_weekdays_open: "soon", business_hours_weekdays_close: "later" })).toBeNull();
  });
});
