import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { setInboxCount, usePushed, current } = vi.hoisted(() => ({ setInboxCount: vi.fn(), usePushed: vi.fn(), current: { business: null as unknown } }));
vi.mock("@/features/app-shell", async (orig) => {
  const real = await orig<typeof import("@/features/app-shell")>();
  return {
    ...real,
    useShell: () => ({ setInboxCount }),
    usePushed,
    useBusiness: () => current.business as import("@/features/app-shell").Business,
    useBusinessValues: () => real.businessValues(current.business as import("@/features/app-shell").Business),
  };
});

import { buildBusiness } from "@/features/app-shell";
import { InboxPage } from "@/features/inbox";

// Made-up business.
current.business = buildBusiness({ name: "Test Roofing Co", owner: "Sam Tester", websiteUrl: "https://www.test-roofing.example", bookingJobUrl: "https://book.test-roofing.example/job" });

const fetchSpy = vi.fn();
vi.stubGlobal("fetch", fetchSpy);
const html = renderToStaticMarkup(<InboxPage />);
const pushedCalls = usePushed.mock.calls.map((c) => c[0]);
const countCalls = fetchSpy.mock.calls.length;

describe("InboxPage markup", () => {
  it("renders content only, without the page wrapper", () => {
    expect(html).not.toContain("data-pg");
    expect(html).not.toContain("fd-view");
    expect(html.startsWith('<div class="fd-ix">')).toBe(true);
    expect(html).toContain("<h1");
  });
  it("starts on the list with the thread closed and the phone not pushed", () => {
    expect(html).not.toContain("fd-ix is-open");
    expect(pushedCalls).toEqual([false]);
  });
  it("has the four filters as a radio group with counts", () => {
    expect(html).toContain('role="radiogroup"');
    expect((html.match(/role="radio"/g) ?? []).length).toBe(4);
    for (const label of ["All", "Under 1 Hr", "1–24 Hrs", "24+ Hrs"]) expect(html).toContain(`>${label}</span>`);
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("--seg:0");
  });
  it("lists nine rows with channel word, wait chip and current marker", () => {
    expect((html.match(/class="fd-cr[ "]/g) ?? []).length).toBe(9);
    expect(html).toContain("Waiting 14 min");
    expect(html).toContain("Waiting 2 days");
    expect(html).toContain("fd-chip is-hot fd-crw");
    expect(html).toContain("fd-chip is-warn fd-crw");
    expect(html).toContain("fd-chip is-bad fd-crw");
    expect(html).toContain('aria-current="true"');
    for (const ch of ["Call", "Text", "Email", "Web form", "Facebook", "Instagram"]) expect(html).toContain(`<span class="fd-srw">${ch}</span>`);
  });
  it("shows the summary and a status role", () => {
    expect(html).toContain('role="status"');
    expect(html).toContain("3 people wait on you.");
    expect(html).toContain("Reply to Nina");
  });
  it("hides the empty state at first", () => {
    expect(html).toContain('class="fd-none is-off"');
  });
  it("labels the reply field above it and has one filled button", () => {
    expect(html).toContain('<label class="fd-clb" for="fd-reply">');
    expect(html).toContain("Reply to Maria by text");
    expect((html.match(/fd-btn is-fill/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-live="polite"');
  });
  it("offers the three quick replies and Mark done", () => {
    for (const q of ["Call in 10 min", "Booking link", "Thanks"]) expect(html).toContain(`>${q}</button>`);
    expect(html).toContain("Mark done");
  });
  it("takes business facts from the signed-in business, not from the component", () => {
    expect(html).toContain("Test Roofing Co");
    const src = readFileSync(join(process.cwd(), "src/features/inbox/components/InboxPage.tsx"), "utf8");
    expect(src).not.toContain("Northway");
  });
  it("with an empty business shows no invented fact, no stray punctuation and no booking-link quick reply", () => {
    current.business = buildBusiness({});
    const empty = renderToStaticMarkup(<InboxPage />);
    current.business = buildBusiness({ name: "Test Roofing Co", owner: "Sam Tester", websiteUrl: "https://www.test-roofing.example", bookingJobUrl: "https://book.test-roofing.example/job" });
    for (const bad of ["Northway", "Mike", "undefined", "null", "{name}", "{first}", "{site}", "{booking link}", "Your business", ">Owner<"]) expect(empty).not.toContain(bad);
    expect(empty).toContain("this is our team.");
    expect(empty).not.toContain(">Booking link</button>");
    expect(empty).toContain(">Thanks</button>");
  });
  it("lets the call button dial only when there is a number", () => {
    expect(html).toContain('href="tel:6145550134"');
  });
  it("does not call fetch while rendering", () => {
    expect(countCalls).toBe(0);
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("inbox sources", () => {
  const files = sources(join(process.cwd(), "src/features/inbox"));
  it("have no network, database or timer code", () => {
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|getPrisma|setTimeout|setInterval/);
    }
  });
});
