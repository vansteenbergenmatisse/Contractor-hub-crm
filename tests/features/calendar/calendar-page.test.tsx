import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/calendar",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AppShell, buildBusiness } from "@/features/app-shell";
import { CalendarPage } from "@/features/calendar";

const NOW = new Date(2026, 10, 20, 10, 0);
const business = buildBusiness({
  name: "Sample Roofing", owner: "Pat Lee", hours: "Mon - Fri: 9 - 4",
  websiteUrl: "https://www.sample-roofing.test", bookingJobUrl: "https://book.sample-roofing.test/job",
});
const bare = buildBusiness({});
const render = (now?: Date, b?: { business_website_url: string; business_hours: string }, shell = business) =>
  renderToStaticMarkup(<AppShell business={shell} searchRows={[]}><CalendarPage now={now} business={b} /></AppShell>);
const html = render(NOW);

describe("CalendarPage markup", () => {
  it("renders the page content inside the shell, without its own fd-view wrapper", () => {
    expect(html).toContain('data-pg="calendar"');
    expect((html.match(/data-pg=/g) ?? []).length).toBe(1);
    expect(html).toContain('<h1 class="fd-pt">Calendar</h1>');
  });

  it("shows the week, the day, the stops and the now line", () => {
    expect(html).toContain("Nov 15 – 21, 2026");
    expect(html).toContain("Friday, Nov 20 · Today");
    expect(html).toContain("4 stops: 3 estimates, 1 job");
    expect(html).toContain("Linda Park");
    expect(html).toContain('class="fd-now"');
    expect(html).toContain(">10:00</i>");
  });

  it("says Not available yet for the synced calendar, with no working switch", () => {
    expect(html).toContain("Not available yet");
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("Synced with");
  });

  it("takes the booking link and hours from the business, not from the code", () => {
    expect(html).toContain("book.sample-roofing.test/job");
    expect(html).toContain("Open Mon - Fri: 9 - 4.");
    const other = render(NOW, { business_website_url: "https://www.other.test", business_hours: "Daily: 8 - 5" });
    expect(other).toContain("other.test/book");
    expect(other).toContain("Daily: 8 - 5");
    expect(other).not.toContain("sample-roofing");
  });

  it("uses the website's /book page when the business has no booking link", () => {
    const site = render(NOW, undefined, buildBusiness({ websiteUrl: "https://www.sample-roofing.test" }));
    expect(site).toContain("sample-roofing.test/book");
  });

  it("shows no link, no copy button and no stray text when the business has nothing", () => {
    const empty = render(NOW, undefined, bare);
    expect(empty).toContain("gets a booking link. The job lands here");
    expect(empty).not.toContain("Copy link");
    expect(empty).not.toContain("/book");
    expect(empty).not.toMatch(/Open \./);
    for (const bad of ["Northway", "Mike", "undefined", "null"]) expect(empty).not.toContain(bad);
  });

  it("has labeled controls: view switch, week arrows, day buttons and the add sheet field", () => {
    expect(html).toContain('role="group" aria-label="View"');
    expect(html).toContain('aria-label="The week before"');
    expect(html).toContain('aria-label="The week after"');
    expect(html).toContain('aria-label="Friday, November 20, 4 stops"');
    expect(html).toContain('<label class="fd-ll" for="fd-ca-name">Customer name</label>');
    expect(html).toContain('aria-pressed="true"');
  });

  it("starts with the sheet, the delete question, the undo line and the detail closed", () => {
    expect(html).toContain('class="fd-cnew is-off"');
    expect(html).toContain('class="fd-cf is-off"');
    expect(html).toContain('class="fd-cdl is-off"');
    expect(html).toContain('class="fd-cdet is-off"');
    expect(html).not.toContain("fx-addscrim is-on");
  });

  it("renders only the header before the clock is known (server render), so no date mismatches", () => {
    const early = render();
    expect(early).toContain('<h1 class="fd-pt">Calendar</h1>');
    expect(early).not.toContain("Linda Park");
  });
});

describe("source rules", () => {
  const dir = join(process.cwd(), "src/features/calendar");
  const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(d, e.name)) : [join(d, e.name)]));
  const source = files(dir).filter((f) => /\.tsx?$/.test(f));

  it("never calls fetch, XMLHttpRequest, sendBeacon or a database", () => {
    for (const f of source) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|getPrisma|@prisma/);
    }
  });

  it("does not hardcode the sample business", () => {
    for (const f of source.filter((x) => !x.endsWith("mock.ts"))) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/Northway|northwayroofing/i);
    }
  });

  it("keeps sample customers in mock.ts only", () => {
    for (const f of source.filter((x) => !x.endsWith("mock.ts"))) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/Grace Whitfield|Linda Park|Paul Ortega/);
    }
    expect(readFileSync(join(dir, "mock.ts"), "utf8")).toMatch(/^\/\/ MOCK DATA \(Phase 2\)/);
  });
});
