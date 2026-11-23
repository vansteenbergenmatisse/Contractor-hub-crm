// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useRouter: () => ({ push: vi.fn(), refresh }),
  useSearchParams: () => null,
}));

import { AppShell, buildBusiness } from "@/features/app-shell";
import { CalendarLivePage, CalendarSkeleton, loadCalendar, type CalendarEventRow, type CalendarResult } from "@/features/calendar";

const NOW = new Date("2026-03-04T17:00:00.000Z");
const row = (over: Partial<CalendarEventRow> = {}): CalendarEventRow => ({
  id: "e1", calendarId: "cal-a", calendarName: "Visits", title: "Pat Test", address: "1 Test St", status: "confirmed",
  startMs: Date.parse("2026-03-04T18:00:00Z"), endMs: Date.parse("2026-03-04T19:00:00Z"), ...over,
});
const result = (events: CalendarEventRow[], extra: { complete?: boolean; dropped?: number; calendarCount?: number } = {}) =>
  loadCalendar("t", null, async (_tenant, boundsFor) => {
    const range = boundsFor("America/New_York")!;
    return { ok: true as const, timeZone: "America/New_York", range, calendarCount: extra.calendarCount ?? 1, events, dropped: extra.dropped ?? 0, complete: extra.complete ?? true };
  }, () => NOW);
const show = (r: CalendarResult) => render(<AppShell business={buildBusiness({})} searchRows={[]}><CalendarLivePage result={r} now={NOW} /></AppShell>);

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

describe("CalendarLivePage", () => {
  it("shows the real appointment and the week in the location's zone", async () => {
    const { container } = show(await result([row()]));
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeTruthy();
    expect(container.textContent).toContain("Mar 1 – 7, 2026");
    expect(container.textContent).toContain("Pat Test");
    expect(container.textContent).toContain("Times are in America/New_York");
    expect(container.querySelector('.fd-ev.is-d3.is-t12.is-l2')).not.toBeNull();
  });

  it("shows no sample stop and no invented free time", async () => {
    const { container } = show(await result([row()]));
    expect(container.textContent).not.toMatch(/Linda Park|Tom Becker|Paul Ortega/);
    expect(container.textContent).not.toMatch(/Pick a free time|Pick a new time/);
    expect(container.querySelector(".fd-cnew")).toBeNull();
    expect(container.querySelector(".fd-dsl")).toBeNull();
  });

  it("keeps every add, reschedule and delete control disabled, and says so", async () => {
    const { container } = show(await result([row()]));
    expect(container.textContent).toContain("Adding, moving and deleting stops is not available here yet.");
    for (const name of [/Add estimate/, /Add job/]) {
      for (const button of screen.getAllByRole("button", { name })) expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.click(container.querySelector(".fd-ev")!);
    const panel = screen.getByRole("complementary", { name: "The stop you pressed" });
    expect(within(panel).getByRole("heading", { name: "Pat Test" })).toBeTruthy();
    expect((within(panel).getByRole("button", { name: /Reschedule/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(panel).getByRole("button", { name: /Delete/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("closes the open stop with Escape", async () => {
    const { container } = show(await result([row()]));
    fireEvent.click(container.querySelector(".fd-ev")!);
    expect(container.querySelector(".fd-cdet.is-on")).not.toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector(".fd-cdet.is-on")).toBeNull();
  });

  it("moves between weeks by URL, so each week is read on the server", async () => {
    show(await result([row()]));
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/calendar?week=2026-02-22");
    expect(hrefs).toContain("/calendar?week=2026-03-08");
    expect(hrefs).toContain("/calendar");
  });

  it("switches to one day with the day buttons", async () => {
    const { container } = show(await result([row()]));
    fireEvent.click(screen.getByRole("button", { name: /Monday, March 2, nothing booked/ }));
    expect(container.querySelector(".fd-cal.is-day.is-sd1")).not.toBeNull();
    expect(container.textContent).toContain("Nothing booked this day.");
  });

  it("says when the week may be incomplete", async () => {
    const { container } = show(await result([row()], { complete: false }));
    expect(container.textContent).toContain("Some appointments may be missing from this week.");
  });

  it("empty: says nothing is booked and keeps the week navigation", async () => {
    const { container } = show(await result([]));
    expect(container.textContent).toContain("Nothing booked this week.");
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toContain("/calendar?week=2026-03-08");
  });

  it("empty: says when the account has no calendars", async () => {
    const { container } = show(await result([], { calendarCount: 0 }));
    expect(container.textContent).toContain("No calendars are set up yet.");
  });

  it("reconnect: tells who can fix it, with no retry", () => {
    const { container } = show({ state: "reconnect" });
    expect(screen.getByRole("alert").textContent).toContain("Your CRM connection needs attention.");
    expect(container.querySelector(".fd-ev")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("unavailable: says nothing changed and can retry", () => {
    show({ state: "unavailable" });
    expect(screen.getByRole("alert").textContent).toContain("Your calendar can't load right now.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("the skeleton claims no data", () => {
    render(<CalendarSkeleton />);
    expect(screen.getByRole("status", { name: "Loading the calendar" })).toBeTruthy();
  });
});
