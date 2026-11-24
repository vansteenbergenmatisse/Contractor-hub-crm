// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarResult, CalendarWeekInfo, LiveStop } from "@/features/calendar";
import type { LeadsResult } from "@/features/leads";

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { bookedThisWeek, CountTile, invoicesToSend, jobsThisWeek, moneyOwed, MoneyCards, quotesOut, TodayNeedsCard } from "@/features/today";
import { isNotifiableCalendar } from "@/features/routes";

// All values are fake.
const week: CalendarWeekInfo = { timeZone: "UTC", weekStart: "2026-03-01", prevWeek: "2026-02-22", nextWeek: "2026-03-08", todayDay: 3, rangeLabel: "", days: [] };
const stop = (eventId: string, service: string, day = 2, startedEarlier = false): LiveStop => ({
  id: `${eventId}:${day}`, eventId, day, start: 0, startMinute: 540, startedEarlier, len: 1, lane: 0, lanes: 1, name: "Stop", service, address: "",
  statusLabel: "", startLabel: "9:00 AM", endLabel: "10:00 AM", past: false,
});
const ready = (stops: LiveStop[], over = {}): CalendarResult => ({ state: "ready", week, stops, loadedAt: "2026-03-04T12:00:00.000Z", complete: true, dropped: 0, ...over });
const invoice = (bucket: "draft" | "sent" | "paid" | "other", test = false) => ({ bucket, test });
const invoices = (rows: ReturnType<typeof invoice>[], over = {}) => ({ state: "ready" as const, rows, total: null, blocked: false, complete: true, ...over });
const quotes = (labels: (string | null)[], over = {}) => ({ state: "ready" as const, quotes: labels.map((statusLabel) => ({ statusLabel })), complete: true, dropped: 0, ...over });

afterEach(cleanup);

describe("Jobs this week", () => {
  it("counts appointments on job calendars once, and never an estimate or a look-alike name", () => {
    const result = ready([stop("a", "Job"), stop("a", "Job", 3), stop("b", "Schedule a Job"), stop("c", "Request an Estimate"), stop("d", "Job Interview")]);
    expect(jobsThisWeek(result, isNotifiableCalendar)).toBe(2);
  });

  it("shows no number when the week cannot be proven", () => {
    expect(jobsThisWeek(ready([stop("a", "Job")], { complete: false }), isNotifiableCalendar)).toBeNull();
    expect(jobsThisWeek(ready([stop("a", "Job")], { dropped: 1 }), isNotifiableCalendar)).toBeNull();
    expect(jobsThisWeek({ state: "unavailable" }, isNotifiableCalendar)).toBeNull();
  });

  it("does not claim zero when no appointment sits on a job calendar", () => {
    expect(jobsThisWeek(ready([stop("c", "Visits")]), isNotifiableCalendar)).toBeNull();
    expect(jobsThisWeek({ state: "empty", week, reason: "no-appointments" }, isNotifiableCalendar)).toBeNull();
  });
});

describe("Booked this week", () => {
  it("counts appointments that start this week, once each", () => {
    expect(bookedThisWeek(ready([stop("a", "Job"), stop("a", "Job", 3), stop("b", "Visits", 0, true)]))).toBe(1);
  });

  it("is zero for a proven empty week and unknown otherwise", () => {
    expect(bookedThisWeek({ state: "empty", week, reason: "no-appointments" })).toBe(0);
    expect(bookedThisWeek({ state: "empty", week, reason: "no-calendars" })).toBeNull();
    expect(bookedThisWeek(ready([stop("a", "Job")], { complete: false }))).toBeNull();
    expect(bookedThisWeek({ state: "reconnect" })).toBeNull();
  });
});

describe("Invoices to send", () => {
  it("counts real drafts only", () => {
    expect(invoicesToSend(invoices([invoice("draft"), invoice("draft", true), invoice("sent")]))).toBe(1);
    expect(invoicesToSend({ state: "empty" })).toBe(0);
  });

  it("shows no number when an invoice could be a hidden draft", () => {
    expect(invoicesToSend(invoices([invoice("draft")], { complete: false }))).toBeNull();
    expect(invoicesToSend(invoices([invoice("draft")], { blocked: true }))).toBeNull();
    expect(invoicesToSend(null)).toBeNull();
    expect(invoicesToSend({ state: "unavailable" })).toBeNull();
  });

  it("keeps the count when only the money total is blocked", () => {
    expect(invoicesToSend(invoices([invoice("draft")], { blocked: true, blockedBy: "currencies" }))).toBe(1);
  });
});

describe("Money owed", () => {
  it("gives the number of invoices, never the amount", () => {
    expect(moneyOwed(invoices([invoice("sent")], { total: { amount: 500, currency: "USD", count: 1 } }))).toBe(1);
  });

  it("is zero only when nothing is proven due", () => {
    expect(moneyOwed(invoices([invoice("paid")]))).toBe(0);
    expect(moneyOwed({ state: "empty" })).toBe(0);
    expect(moneyOwed(invoices([invoice("sent")], { blocked: true }))).toBeNull();
    expect(moneyOwed(null)).toBeNull();
  });
});

describe("Quotes out", () => {
  it("counts sent and viewed quotes", () => {
    expect(quotesOut(quotes(["Sent", "Viewed", "Draft", "Accepted"]))).toBe(2);
    expect(quotesOut({ state: "empty" })).toBe(0);
  });

  it("shows no number when a quote's status is unknown or the read is partial", () => {
    expect(quotesOut(quotes(["Sent", null]))).toBeNull();
    expect(quotesOut(quotes(["Sent"], { complete: false }))).toBeNull();
    expect(quotesOut(quotes(["Sent"], { dropped: 1 }))).toBeNull();
    expect(quotesOut(null)).toBeNull();
  });
});

describe("the live Today sections", () => {
  it("shows a count on a tile, and the chip when there is none", () => {
    render(<CountTile page="pipeline" label="Jobs this week" index={2} count={3} unit="jobs" />);
    expect(screen.getByRole("button", { name: "Jobs this week: 3 jobs. Open" })).toBeTruthy();
    cleanup();
    render(<CountTile page="invoices" label="Invoices to send" index={3} count={null} unit="to send" />);
    expect(screen.getByText("Not available yet")).toBeTruthy();
  });

  it("shows counts in Money with no amount", () => {
    const { container } = render(<MoneyCards counts={{ booked: 4, quotes: 2, owed: null }} />);
    expect(container.textContent).toContain("4 appointments");
    expect(container.textContent).toContain("2 sent");
    expect(container.textContent).toContain("Not available yet");
    expect(container.textContent).not.toMatch(/\$/);
  });

  const leads: LeadsResult = { state: "empty" };

  it("Needs you lists only what has a real count, and names what was not checked", () => {
    const { container } = render(<TodayNeedsCard leads={leads} toSend={2} timeZone="UTC" />);
    expect(screen.getByRole("link", { name: "2 invoices to send" })).toHaveAttribute("href", "/invoices");
    expect(container.textContent).not.toContain("Not available yet");
    cleanup();
    render(<TodayNeedsCard leads={leads} toSend={null} timeZone="UTC" />);
    expect(screen.getByText("Invoices could not be checked.")).toBeTruthy();
    expect(screen.queryByText(/Nothing needs you/)).toBeNull();
  });

  it("says nothing needs you only when every source was checked", () => {
    render(<TodayNeedsCard leads={leads} toSend={0} timeZone="UTC" />);
    expect(screen.getByText("Nothing needs you right now.")).toBeTruthy();
  });

  it("keeps Not available yet when no source can be read", () => {
    render(<TodayNeedsCard leads={{ state: "unavailable" }} toSend={null} timeZone="UTC" />);
    expect(screen.getByText("Not available yet")).toBeTruthy();
  });
});
