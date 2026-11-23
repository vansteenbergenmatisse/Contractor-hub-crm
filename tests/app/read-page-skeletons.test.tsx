import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationsSkeleton } from "@/features/automations";
import { InvoicesSkeleton } from "@/features/invoices";
import { QuotesSkeleton } from "@/features/quotes";

describe.each([
  { title: "Quotes", root: "fd-dv", Skeleton: QuotesSkeleton },
  { title: "Automations", root: "fd-au", Skeleton: AutomationsSkeleton },
])("$title skeleton", ({ title, root, Skeleton }) => {
  const html = renderToStaticMarkup(<Skeleton />);

  it("announces loading the same way as the invoices skeleton", () => {
    expect(html).toContain(`<h1 class="fd-pt">${title}</h1>`);
    expect(html).toContain(`role="status" aria-busy="true" aria-label="Loading ${title.toLowerCase()}"`);
    expect(html).toContain('<div aria-hidden="true"');
  });

  it("matches the invoices skeleton apart from its title and page root", () => {
    const expected = renderToStaticMarkup(<InvoicesSkeleton title={title} />).replace('class="fd-dv"', `class="${root}"`);
    expect(html).toBe(expected);
  });
});
