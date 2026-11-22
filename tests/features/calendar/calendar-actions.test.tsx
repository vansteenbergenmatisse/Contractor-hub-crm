import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalendarActions } from "@/features/calendar";

// Rendered on its own: the shell shows this bar only on a phone, and only from an effect.
describe("CalendarActions (phone action bar)", () => {
  const noop = () => {};
  const html = renderToStaticMarkup(<CalendarActions onPrevWeek={noop} onNextWeek={noop} onToday={noop} onAddEstimate={noop} onAddJob={noop} />);

  it("has week arrows, Today, Estimate and Job", () => {
    expect(html).toContain('aria-label="The week before"');
    expect(html).toContain('aria-label="The week after"');
    expect(html).toContain(">Today</button>");
    expect(html).toContain("<span>Estimate</span>");
    expect(html).toContain("<span>Job</span>");
  });

  it("has one filled button: Estimate", () => {
    expect((html.match(/class="fd-btn"/g) ?? []).length).toBe(1);
    expect((html.match(/is-plain/g) ?? []).length).toBe(2);
  });
});
