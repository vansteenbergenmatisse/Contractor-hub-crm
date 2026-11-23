import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AutomationsRoute from "../../src/app/(app)/automations/page";
import InvoicesRoute from "../../src/app/(app)/invoices/page";
import PaymentsRoute from "../../src/app/(app)/payments/page";
import QuotesRoute from "../../src/app/(app)/quotes/page";

// Real clients never see sample customers: a page that is not wired to real data says so.
const ROUTES: readonly [string, string, () => ReactElement][] = [
  ["quotes", "Quotes", QuotesRoute],
  ["invoices", "Invoices", InvoicesRoute],
  ["payments", "Payments due", PaymentsRoute],
  ["automations", "Automations", AutomationsRoute],
];

// Every sample name and dollar amount written in that feature's mock module.
function samples(feature: string): string[] {
  const source = readFileSync(join(process.cwd(), `src/features/${feature}/mock.ts`), "utf8");
  const names = [...source.matchAll(/\bname: "([^"]+)"/g)].map((m) => m[1]);
  const amounts = source.match(/\$\d[\d,.]*/g) ?? [];
  return [...names, ...amounts];
}

describe.each(ROUTES)("the %s route", (feature, title, Route) => {
  const html = renderToStaticMarkup(Route());

  it("keeps its page title", () => {
    expect(html).toContain(`<h1 class="fd-pt">${title}</h1>`);
  });

  it("shows the existing Not available yet chip", () => {
    expect(html).toContain('<span class="fd-chip is-plain">Not available yet</span>');
  });

  it("offers a way out to the leads page", () => {
    const link = html.match(/<a\b[^>]*>See your leads<\/a>/)?.[0];
    expect(link).toBeDefined();
    expect(link).toContain('href="/leads"');
    expect(link).toContain('class="fd-btn is-plain"');
  });

  it("shows no row that could pass for a real record", () => {
    expect(html).not.toContain("fd-lst");
    expect(html).not.toContain("fd-rw");
  });

  it("makes no claim about when the page will arrive", () => {
    expect(html).not.toMatch(/\b(soon|coming|shortly|later)\b/i);
  });

  it("renders no sample name or amount", () => {
    for (const sample of samples(feature)) expect(html).not.toContain(sample);
    expect(html).not.toMatch(/\$\d/);
  });

  it("claims no connection status", () => {
    expect(html).not.toMatch(/\b(connected|not connected|disconnected)\b/i);
  });
});
