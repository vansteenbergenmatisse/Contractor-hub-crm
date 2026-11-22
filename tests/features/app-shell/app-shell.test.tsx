import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/pipeline",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { AppShell, buildBusiness } from "@/features/app-shell";

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
});
