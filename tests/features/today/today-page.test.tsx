import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const sendTimer = vi.fn();
const registered: unknown[] = [];

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/app-shell", async (original) => ({
  ...(await original<typeof import("@/features/app-shell")>()),
  useShell: () => ({ sendTimer, askReason: vi.fn(), setInboxCount: vi.fn(), setAction: vi.fn(), setPushed: vi.fn(), openSearch: vi.fn(), openFeedback: vi.fn() }),
  PageAction: ({ children }: { children: unknown }) => {
    registered.push(children);
    return null;
  },
}));

import {
  CalendarCard, Greeting, initialState, LeadsCard, MoneyCards, NeedsCard, setFilter, setStatus, STOPS, TodayPage, TODOS,
} from "@/features/today";

const noop = () => {};
const html = renderToStaticMarkup(<TodayPage ownerFirst="Pat" />);

describe("TodayPage markup", () => {
  it("renders the content without the shell's fd-view wrapper", () => {
    expect(html).not.toContain("fd-view");
    expect(html).not.toContain("data-pg");
  });

  it("greets the owner by first name and counts the six things", () => {
    expect(html).toContain("Morning, Pat.");
    expect(html).toContain("6 things");
    expect(html).toContain("need you today.");
  });

  it("has four tiles that open their page, with counts from the lists", () => {
    expect((html.match(/class="fd-tile fd-in"/g) ?? []).length).toBe(4);
    expect(html).toContain('aria-label="New leads: 4 today, 13 this week. Open leads"');
    expect(html).toContain('aria-label="Appointments: 4 today, next at 11:00 AM. Open the calendar"');
    expect(html).toContain('aria-label="Invoices to send: 4. Open Invoices"');
    expect(html).toContain('aria-label="Jobs this week: 6, 1 today. Open the job stages in the pipeline"');
  });

  it("lists the six to-dos with one filled button on the top row only", () => {
    expect((html.match(/<li class="fd-row/g) ?? []).length).toBe(6);
    expect((html.match(/is-next/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((html.match(/class="fd-row[^"]*is-next/g) ?? []).length).toBe(1);
    expect(html).toContain("Yes, send invoice");
    expect(html).toContain("Yes, invoice");
  });

  it("has the four filters with aria-pressed, All on", () => {
    expect(html).toMatch(/class="fd-flb is-on" aria-pressed="true">All</);
    expect(html).toMatch(/aria-pressed="false">Quotes</);
  });

  it("shows today's calendar, new leads (both lists) and the three money cards", () => {
    expect(html).toContain("4 appointments");
    expect(html).toContain("Next · in 20 min");
    expect(html).toContain("<b>4</b> new today");
    expect(html).toContain("<b>13</b> this week");
    expect(html).toContain("Booked this week");
    expect(html).toContain("Quotes out");
    expect(html).toContain("Money owed");
  });

  it("registers the Next action in the action bar", () => {
    expect(registered.length).toBeGreaterThan(0);
    expect(renderToStaticMarkup(<>{registered[0] as never}</>)).toContain("Next: Call · Maria Alvarez");
  });

  it("never hardcodes the sample business in its markup", () => {
    for (const sample of ["Northway", "Mike", "northwayroofing"]) expect(html).not.toContain(sample);
  });

  it("greets without a name when the owner's name is missing", () => {
    for (const first of [undefined, "", "  "]) {
      const bare = renderToStaticMarkup(<TodayPage ownerFirst={first} />);
      expect(bare).toContain("Morning. <strong");
      for (const bad of ["Mike", "undefined", "null", "Morning,"]) expect(bare).not.toContain(bad);
    }
  });
});

describe("NeedsCard", () => {
  const render = (state = initialState(TODOS)) =>
    renderToStaticMarkup(<NeedsCard todos={TODOS} state={state} onFilter={noop} onPress={noop} onUndo={noop} />);

  it("shows the done line, strike-through class and Undo after a press", () => {
    const out = render(setStatus(initialState(TODOS), TODOS, "maria", 1));
    expect(out).toContain("fd-row is-done is-last");
    expect(out).toContain("Called. The follow-up texts stop.");
    expect(out).toContain('class="fd-link fd-undo"');
  });

  it("marks rows off when a filter is on", () => {
    const out = render(setFilter(initialState(TODOS), "quote"));
    expect((out.match(/class="fd-row[^"]*is-off/g) ?? []).length).toBe(4);
    expect(out).toMatch(/class="fd-flb is-on" aria-pressed="true">Quotes</);
  });

  it("gives two-answer rows both buttons", () => {
    const out = render();
    expect(out).toContain(">No-show</button>");
    expect(out).toContain(">Yes, paid</button>");
  });

  it("shows the waiting chip with its word and icon", () => {
    expect(render()).toMatch(/class="fd-chip is-warn"><svg[^>]*aria-hidden="true"[^>]*>.*<\/svg>Waiting 14 min/);
  });
});

describe("CalendarCard", () => {
  it("shows Tom's answer chip hidden at first and 'No-show' after the answer", () => {
    const before = renderToStaticMarkup(<CalendarCard stops={STOPS} state={initialState(TODOS)} />);
    expect(before).toContain("fd-chip is-plain is-off");
    const after = renderToStaticMarkup(<CalendarCard stops={STOPS} state={setStatus(initialState(TODOS), TODOS, "tom", 2)} />);
    expect(after).toContain("fd-chip is-plain is-pop");
    expect(after).toContain(">No-show<");
  });

  it("labels each Directions button and links nowhere, as in the design", () => {
    const out = renderToStaticMarkup(<CalendarCard stops={STOPS} state={initialState(TODOS)} />);
    expect(out).toContain('aria-label="Directions to Linda Park"');
    expect(out).not.toContain("maps.google.com");
  });

  it("shows Directions only for a stop with an address, as a plain button", () => {
    const out = renderToStaticMarkup(<CalendarCard stops={[{ ...STOPS[0], address: "" }, { ...STOPS[1], address: "  " }, STOPS[2]]} state={initialState(TODOS)} />);
    expect((out.match(/class="fd-link fd-dir"/g) ?? []).length).toBe(1);
    expect(out).toContain(`aria-label="Directions to ${STOPS[2].name}"`);
    expect(out).toMatch(/<button[^>]*class="fd-link fd-dir"/);
  });

  it("has no stops without error (empty list)", () => {
    const out = renderToStaticMarkup(<CalendarCard stops={[]} state={initialState(TODOS)} />);
    expect(out).toContain("0 appointments");
  });
});

describe("LeadsCard", () => {
  it("switches the visible list and the segment thumb", () => {
    const today = renderToStaticMarkup(<LeadsCard range="today" onRange={noop} />);
    expect(today).toContain('class="fd-thumb"');
    expect(today).toMatch(/class="fd-pane is-off"><p class="fd-big"><b>13<\/b>/);
    const week = renderToStaticMarkup(<LeadsCard range="week" onRange={noop} />);
    expect(week).toContain("fd-thumb is-week");
    expect(week).toMatch(/class="fd-pane is-off"><p class="fd-big"><b>4<\/b>/);
  });
});

describe("Greeting and money", () => {
  it("says All done at zero", () => {
    expect(renderToStaticMarkup(<Greeting first="Pat" left={0} numClass="fd-num" />)).toContain("All done</strong> for today.");
  });

  it("renders the money cards with late chips carrying a word", () => {
    // A fixed "now": without one the server render leaves the due days out (they depend on the
    // browser's time zone and appear after hydration).
    const out = renderToStaticMarkup(<MoneyCards now={new Date()} />);
    expect(out).toContain("14 days late");
    expect(out).toContain('role="img"');
  });
});

describe("no network and no automation in the feature", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
    }
  };
  walk(join(process.cwd(), "src", "features", "today"));

  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it("no source file calls fetch, XMLHttpRequest, a timer or Prisma", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8").replace(/\/\/.*$/gm, "");
      expect(source, file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|setTimeout|getPrisma|highlevel/i);
    }
  });
});
