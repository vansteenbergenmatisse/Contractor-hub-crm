import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pipeline",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AppShell, buildBusiness, SearchSheet } from "@/features/app-shell";

const business = buildBusiness({ name: "Sample Roofing", owner: "Pat Lee", keyword: "Roofing", city: "Dayton", state: "OH" });
const html = renderToStaticMarkup(<AppShell business={business} searchRows={[]}><p>page body</p></AppShell>);

describe("AppShell markup", () => {
  it("renders the business, the owner and the page body", () => {
    expect(html).toContain("Sample Roofing");
    expect(html).toContain("Pat Lee");
    expect(html).toContain("page body");
    expect(html).toContain('data-pg="pipeline"');
  });

  it("links every page in the side menu and marks the current one", () => {
    for (const title of ["Today", "Inbox", "Calendar", "Pipeline", "Leads", "Quotes", "Invoices", "Payments due", "Automations", "Settings"]) {
      expect(html).toContain(`>${title}</span>`);
    }
    expect(html).toMatch(/class="fd-nav is-on"[^>]*aria-current="page"/);
  });

  it("has a phone tab bar with four pages and More, and a search button", () => {
    expect(html).toContain('aria-label="Main pages"');
    expect((html.match(/class="fd-tab[ "]/g) ?? []).length).toBe(5);
    expect(html).toContain("More");
    expect(html).toContain('aria-label="Search"');
  });

  it("starts with the menu, feedback and search closed and the action bar hidden", () => {
    expect(html).not.toContain("fd-scrim is-open");
    expect(html).toContain('class="fd-fb"');
    expect(html).not.toContain('role="combobox"');
    expect(html).toContain("fx-acc fd-hid");
  });

  it("offers sign out and send feedback", () => {
    expect(html).toContain("Sign out");
    expect(html).toContain("Send feedback");
  });

  it("names the feedback field", () => {
    expect(html).toMatch(/<textarea[^>]*id="fd-fb-text"[^>]*name="feedback"/);
  });

  it("wraps the page in a view that animates on entrance", () => {
    expect(html).toContain('class="fd-view is-nav-a" data-pg="pipeline"');
  });
});

describe("SearchSheet markup", () => {
  const rows = [{ id: "r1", page: "leads" as const, name: "Maria Alvarez", sub: "Roof leak", href: "/leads" }];
  const noop = () => {};

  it("is a full-screen sheet on a phone, with a visible Cancel and no shortcut hint", () => {
    const phone = renderToStaticMarkup(<SearchSheet rows={rows} onClose={noop} onOpen={noop} viewportWidth={390} isMac />);
    expect(phone).toContain('class="fx-search is-ph"');
    expect(phone).toContain('class="fx-scx"');
    expect(phone).not.toContain("fx-shint");
  });

  it("is anchored on a computer and shows the keyboard hint (Ctrl off a Mac)", () => {
    const desk = renderToStaticMarkup(<SearchSheet rows={rows} onClose={noop} onOpen={noop} viewportWidth={1440} isMac={false} />);
    expect(desk).toContain('class="fx-search"');
    expect(desk).toMatch(/class="fx-search"[^>]*style="left:\d+px;top:\d+px;width:600px"/);
    expect(desk).toContain('<p class="fx-shint"><kbd class="fx-k">Ctrl ?</kbd><span>shows every keyboard shortcut</span></p>');
    const mac = renderToStaticMarkup(<SearchSheet rows={rows} onClose={noop} onOpen={noop} viewportWidth={1440} isMac />);
    expect(mac).toContain('<kbd class="fx-k">⌘?</kbd>');
  });

  it("gives the scope chips a roving tab stop", () => {
    const desk = renderToStaticMarkup(<SearchSheet rows={rows} onClose={noop} onOpen={noop} viewportWidth={1440} isMac />);
    expect((desk.match(/role="radio"[^>]*tabindex="0"/g) ?? []).length).toBe(1);
    expect((desk.match(/role="radio"[^>]*tabindex="-1"/g) ?? []).length).toBe(6);
  });
});
