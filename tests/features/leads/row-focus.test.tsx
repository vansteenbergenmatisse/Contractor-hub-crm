// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { AppShell, buildBusiness } from "@/features/app-shell";
import { LeadsPage } from "@/features/leads";
import { FIXTURE_LEADS, READY } from "./fixtures";

const business = buildBusiness({ name: "Test Roofing Co", owner: "Pat Lee" });
const page = () => render(<AppShell business={business} searchRows={[]}><LeadsPage result={READY} /></AppShell>);

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true, writable: true });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

// A Today lead link lands on the row: useRowFocus can focus it, and Tab still skips it.
describe("lead rows can take focus from a link without becoming Tab stops", () => {
  it("a loaded lead row", () => {
    page();
    const row = document.querySelector<HTMLElement>(`[data-row-id="${FIXTURE_LEADS[0].id}"]`)!;
    expect(row).toHaveAttribute("tabindex", "-1");
    row.focus();
    expect(document.activeElement).toBe(row);
  });

  it("a hand-added lead row", async () => {
    const user = userEvent.setup();
    page();
    await user.type(screen.getByLabelText("Name"), "Pat Test");
    await user.type(screen.getByLabelText("Phone"), "6145550100");
    await user.click(screen.getByRole("button", { name: /^Add lead$/ }));
    const row = document.querySelector<HTMLElement>(".fd-rw.is-new")!;
    expect(row).toHaveAttribute("tabindex", "-1");
    row.focus();
    expect(document.activeElement).toBe(row);
  });
});
