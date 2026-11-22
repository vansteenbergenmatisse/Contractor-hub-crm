// @vitest-environment happy-dom
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Lead, LeadsResult } from "@/features/leads";

const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh }),
}));

vi.mock("@/features/app-shell", async (original) => ({
  ...(await original<typeof import("@/features/app-shell")>()),
  useShell: () => ({ sendTimer: vi.fn(), askReason: vi.fn(), setInboxCount: vi.fn(), setAction: vi.fn(), setPushed: vi.fn(), openSearch: vi.fn(), openFeedback: vi.fn() }),
  PageAction: () => null,
}));

import { LeadsCard, LeadsTile, TodayPage } from "@/features/today";

const LOADED_AT = "2026-03-04T12:00:00.000Z";
const lead = (id: string, name: string, receivedAt: string): Lead => ({
  id, name, source: null, need: "", minutesWaiting: 0, receivedAt, address: "", status: "new",
});
// Two different contacts may share a name: rows are keyed by contact id.
const LEADS: Lead[] = [
  lead("c1", "Test Person", "2026-03-04T11:00:00.000Z"),
  lead("c2", "Test Person", "2026-03-04T10:00:00.000Z"),
  lead("c3", "Other Person", "2026-03-02T10:00:00.000Z"),
];
const ready = (complete: boolean, leads = LEADS): LeadsResult => ({ state: "ready", leads, loadedAt: LOADED_AT, complete, dropped: 0 });
const card = (result: LeadsResult | null, range: "today" | "week" = "today") =>
  renderToStaticMarkup(<LeadsCard result={result} range={range} onRange={() => {}} timeZone="UTC" />);

function samples(): string[] {
  const source = readFileSync(join(process.cwd(), "src/features/today/mock.ts"), "utf8");
  return [...[...source.matchAll(/\bname: "([^"]+)"/g)].map((m) => m[1]), ...(source.match(/\$\d[\d,.]*/g) ?? [])];
}

describe("Today shows no sample data", () => {
  const html = renderToStaticMarkup(<TodayPage ownerFirst="Pat" />);

  it("renders no sample name or amount", () => {
    expect(samples().length).toBeGreaterThan(10);
    for (const sample of samples()) expect(html).not.toContain(sample);
    expect(html).not.toMatch(/\$\d/);
  });

  it("keeps the greeting, with no invented count of things", () => {
    expect(html).toContain("Morning, Pat.");
    expect(html).not.toMatch(/\bthings?\b|All.done/);
  });

  it("keeps every section title and marks what has no data", () => {
    for (const title of ["Needs you", "Today’s calendar", "New leads", "Booked this week", "Quotes out", "Money owed"]) expect(html).toContain(title);
    expect((html.match(/fd-chip is-plain">Not available yet/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });

  it("has no button that would write or send", () => {
    expect(html).not.toMatch(/>(Call|Reply|Approve|Visit done|No-show|Yes, paid|Book visit|Remind)</);
  });

  it("no production file imports the sample modules", () => {
    const dir = join(process.cwd(), "src/features/today");
    const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => /\.tsx?$/.test(f) && f !== "mock.ts");
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source, file).not.toMatch(/from "[^"]*\/mock"|@\/features\/(quotes|invoices)/);
    }
  });
});

describe("Today lead rows are the tenant's real leads", () => {
  it("shows both contacts that share a name, keyed by id, with no key warning", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<LeadsCard result={ready(true)} range="today" onRange={() => {}} timeZone="UTC" />);
    expect(screen.getAllByText("Test Person").length).toBeGreaterThanOrEqual(2);
    expect(spy.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    spy.mockRestore();
  });

  it("shows the received time, no waiting chip and no button in a row", () => {
    render(<LeadsCard result={ready(true)} range="today" onRange={() => {}} timeZone="UTC" />);
    const row = document.querySelector<HTMLElement>(".fd-pane:not(.is-off) .fd-lead") as HTMLElement;
    expect(row).toHaveTextContent("1 hr");
    expect(row.textContent).not.toMatch(/waiting/i);
    expect(row.querySelector(".fd-chip")).toBeNull();
    expect(within(row).queryByRole("button")).toBeNull();
  });

  it("splits today from the last seven days in the viewer's time zone", () => {
    const out = card(ready(true));
    expect(out).toContain("<b>2</b> new today");
    expect(out).toContain("<b>3</b> this week");
  });

  it("hides the counts the loaded page cannot prove, but keeps the rows", () => {
    const partial = ready(false, LEADS.slice(0, 2));
    const out = card(partial);
    expect(out).not.toMatch(/<b>\d+<\/b> (new today|this week)/);
    expect(out).toContain("Test Person");
  });

  it("shows the today count when an older row proves it, and hides the unproven week", () => {
    const out = card(ready(false));
    expect(out).toContain("<b>2</b> new today");
    expect(out).not.toMatch(/<b>\d+<\/b> this week/);
  });

  it("says plainly when nothing came in today", () => {
    const out = card(ready(true, [LEADS[2]]));
    expect(out).toContain("<b>0</b> new today");
  });

  it.each([
    ["empty", "No leads yet."],
    ["reconnect", "Your CRM connection needs attention."],
    ["unavailable", "Your leads can&#x27;t load right now."],
  ] as const)("shows the %s state with no rows", (state, text) => {
    const out = card({ state });
    expect(out).toContain(text);
    expect(out).not.toContain("fd-lead\"");
  });

  it("offers Try again only when the load failed", () => {
    render(<LeadsCard result={{ state: "unavailable" }} range="today" onRange={() => {}} timeZone="UTC" />);
    screen.getByRole("button", { name: "Try again" }).click();
    expect(refresh).toHaveBeenCalled();
    expect(card({ state: "empty" })).not.toContain("Try again");
    expect(card({ state: "reconnect" })).not.toContain("Try again");
  });

  it("shows a loading state without any value", () => {
    const out = card(null);
    expect(out).toContain('aria-busy="true"');
    expect(out).not.toMatch(/<b>\d/);
  });
});

describe("the New leads tile", () => {
  const tile = (result: LeadsResult | null) => renderToStaticMarkup(<LeadsTile result={result} />);

  it("counts today and the week when the data proves them", () => {
    expect(tile(ready(true))).toContain('aria-label="New leads: 2 today, 3 this week. Open leads"');
  });

  it("hides an unproven count", () => {
    const out = tile(ready(false, LEADS.slice(0, 2)));
    expect(out).toContain('aria-label="New leads: not available yet. Open leads"');
    expect(out).not.toMatch(/<b>\d/);
  });

  it("counts zero for a tenant with no contacts", () => {
    expect(tile({ state: "empty" })).toContain('aria-label="New leads: 0 today, 0 this week. Open leads"');
  });

  it.each(["reconnect", "unavailable"] as const)("shows no number when %s", (state) => {
    const out = tile({ state });
    expect(out).toContain("Not available yet");
    expect(out).not.toMatch(/<b>\d/);
  });
});
