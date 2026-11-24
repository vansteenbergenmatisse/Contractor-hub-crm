// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/leads",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { AppShell, PageStateProvider, buildBusiness } from "@/features/app-shell";
import { LeadsPage, NewLeadDialog, createInitialState, leadsReducer, sourceBreakdown, type LeadOrigin } from "@/features/leads";
import { NEW_LEAD_EVENT, requestNewLead } from "@/shared/lib/new-lead-event";

afterEach(cleanup);

const addLead = async (name = "Pat") => {
  const user = userEvent.setup();
  requestNewLead();
  const dialog = await screen.findByRole("dialog", { name: "New lead" });
  await user.type(within(dialog).getByLabelText("Name"), name);
  await user.type(within(dialog).getByLabelText("Phone"), "6145550100");
  await user.click(within(dialog).getByRole("button", { name: "Add lead" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  return user;
};

describe("New lead on a phone or tablet", () => {
  it("sits in the phone bar outside the group the stylesheet hides under 1024px", () => {
    render(<AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}><p>x</p></AppShell>);
    const bar = document.querySelector<HTMLElement>(".fd-mtop")!;
    const button = within(bar).getByRole("button", { name: "New lead" });
    expect(button.closest(".fd-tools")).toBeNull();
    const heard = vi.fn();
    window.addEventListener(NEW_LEAD_EVENT, heard);
    button.click();
    window.removeEventListener(NEW_LEAD_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

describe("a lead added while Leads has no rows", () => {
  it.each(["empty", "reconnect", "unavailable"] as const)("shows the added lead in the %s state", async (state) => {
    render(<PageStateProvider><div className="fd-app"><LeadsPage result={{ state }} /><NewLeadDialog /></div></PageStateProvider>);
    await addLead("Pat Added");
    expect(document.querySelector("[data-row-id='added-1']")).toHaveTextContent("Pat Added");
    expect(document.querySelector("[data-row-id='added-1']")).toHaveTextContent("not saved");
  });

  it("does not say there are no leads next to an added one", async () => {
    render(<PageStateProvider><div className="fd-app"><LeadsPage result={{ state: "empty" }} /><NewLeadDialog /></div></PageStateProvider>);
    await addLead();
    expect(screen.queryByText("No leads yet.")).toBeNull();
  });

  it("confirms the add on any page, says it is not saved, and can be dismissed", async () => {
    render(<PageStateProvider><div className="fd-app"><NewLeadDialog /></div></PageStateProvider>);
    const user = await addLead();
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Lead added to your Leads screen. It is not saved.");
    expect(within(notice).getByRole("link", { name: "Open Leads" })).toHaveAttribute("href", "/leads");
    await user.click(within(notice).getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("the channel of a hand-added lead", () => {
  const context = { loadedAt: "2026-03-04T12:00:00.000Z", timeZone: "UTC", complete: true, dropped: 0 };
  const origins: LeadOrigin[] = ["call", "text", "email", "website", "fb", "ig", "gmb", "bing", "gads", "you"];

  it.each(origins)("counts a lead added as %s on exactly that row", (channel) => {
    let state = createInitialState([]);
    state = leadsReducer(state, { type: "field", field: "name", value: "Pat" });
    state = leadsReducer(state, { type: "field", field: "phone", value: "6145550100" });
    state = leadsReducer(state, { type: "submit", channel });
    const rows = sourceBreakdown([], state.addedBy ?? 0, "all", context).rows;
    for (const row of rows) expect([row.key, row.count]).toEqual([row.key, row.key === channel ? 1 : 0]);
  });

  it("keeps counting past the three rows on screen", () => {
    let state = createInitialState([]);
    for (let i = 0; i < 5; i += 1) {
      state = leadsReducer(state, { type: "field", field: "name", value: `Pat ${i}` });
      state = leadsReducer(state, { type: "field", field: "phone", value: "6145550100" });
      state = leadsReducer(state, { type: "submit", channel: "fb" });
    }
    expect(sourceBreakdown([], state.addedBy ?? 0, "all", context).rows.find((r) => r.key === "fb")?.count).toBe(5);
  });
});

describe("the source field comes first", () => {
  it("in Add a lead by hand on a computer", () => {
    render(<AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}><LeadsPage result={{ state: "ready", leads: [], loadedAt: "2026-03-04T12:00:00.000Z", complete: true, dropped: 0 }} timeZone="UTC" /></AppShell>);
    const panel = screen.getByRole("heading", { name: "Add a lead by hand" }).closest("section")!;
    expect(panel.querySelectorAll("select, input")[0]).toBe(within(panel).getByLabelText("Where the lead came from"));
  });
});

describe("the no-network rule", () => {
  it("keeps the Places client out of the leads folder", () => {
    const routes = readFileSync(join(process.cwd(), "src/features/leads/api/lead-routes.ts"), "utf8");
    expect(routes).not.toMatch(/fetch\s*\(|places\.googleapis/i);
  });
});
