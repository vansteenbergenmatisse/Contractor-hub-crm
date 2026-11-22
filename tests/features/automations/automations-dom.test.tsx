// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/automations",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// The sub-account's custom values as the shell passes them (seasonal offer and referral reward set).
const values = vi.hoisted(() => ({
  current: {} as Record<string, string>,
}));
vi.mock("@/features/app-shell", async (orig) => {
  const real = await orig<typeof import("@/features/app-shell")>();
  return {
    ...real,
    useBusinessValues: () => values.current,
    useKeptReducer: vi.fn(real.useKeptReducer),
    useBusiness: () => ({ googleReviewUrl: null }),
    usePushed: () => {},
    PageAction: () => null,
  };
});

import { AppShell, GestureLayer, buildBusiness, useKeptReducer } from "@/features/app-shell";
import { AutomationsPage } from "@/features/automations";

const BASE = { business_name: "Sample Roofing", business_owner_name: "Pat Lee", business_main_keyword: "Roofing", business_phone_number: "" };

afterEach(() => {
  cleanup();
  values.current = {};
});

describe("Automations in the browser", () => {
  it("shows the tenant's seasonal offer in the Promotion campaign row when it is set", () => {
    values.current = { ...BASE, seasonal_offer_text: "Spring gutter checks, 10% off", referral_reward_text: "You both get a free check." };
    render(<AutomationsPage />);
    expect(screen.getByText('Texts old leads your seasonal offer: "Spring gutter checks, 10% off"')).toBeInTheDocument();
  });

  it("Send me a test shows the design's line with the business phone", async () => {
    const user = userEvent.setup();
    values.current = { ...BASE, business_phone_number: "+1 (555) 010-0000", referral_reward_text: "You both get a free check." };
    render(<AutomationsPage />);
    const edits = screen.getAllByRole("button", { name: "Edit" });
    const names = screen.getAllByText(/./, { selector: ".fd-rn .fd-h" }).map((n) => n.textContent);
    await user.click(edits[names.indexOf("Referral ask")]);
    await user.click(screen.getByRole("button", { name: "Send me a test" }));
    expect(screen.getByText("Test text sent to +1 (555) 010-0000.")).toBeInTheDocument();
  });

  it("shows no placeholder text when the offer is not set", () => {
    values.current = { ...BASE };
    render(<AutomationsPage />);
    expect(screen.getByText("Texts old leads your seasonal offer.")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/no seasonal offer set|\{seasonal offer\}/);
  });

  it("keeps a switched-off row and a removal when the owner leaves the page and comes back", async () => {
    const user = userEvent.setup();
    values.current = { ...BASE };
    function Shell() {
      const [on, setOn] = useState(true);
      return (
        <AppShell business={buildBusiness({ name: "Sample Roofing", owner: "Pat Lee" })} searchRows={[]}>
          <button type="button" onClick={() => setOn((x) => !x)}>switch page</button>
          {on ? <AutomationsPage /> : <p>other page</p>}
        </AppShell>
      );
    }
    render(<Shell />);
    await user.click(screen.getByRole("switch", { name: "Owner ping" }));
    expect(screen.getByRole("switch", { name: "Owner ping" })).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(screen.getByText("other page")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(screen.getByRole("switch", { name: "Owner ping" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Switched off").previousElementSibling).toHaveTextContent("1");
  });

  it("keeps its state under the page key \"automations\"", () => {
    values.current = { ...BASE };
    render(<AutomationsPage />);
    expect(vi.mocked(useKeptReducer).mock.calls.every((c) => c[0] === "automations")).toBe(true);
    expect(vi.mocked(useKeptReducer)).toHaveBeenCalled();
  });

  it("Edit, rename and Save shows the new name on the row; New then opens an empty draft", async () => {
    const user = userEvent.setup();
    values.current = { ...BASE };
    render(<AutomationsPage />);
    const row = document.getElementById("fd-au-wf-3")!;
    expect(within(row).getByText("Owner ping")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Edit" }));
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    expect(name.value).toBe("Owner ping");
    await user.clear(name);
    await user.type(name, "Lead alert");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(within(document.getElementById("fd-au-wf-3")!).getByText("Lead alert")).toBeInTheDocument();
    expect(within(document.getElementById("fd-au-wf-3")!).getByText("Changed by you just now")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "New automation" })[0]);
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("3. The text that goes out") as HTMLTextAreaElement).value).toBe("");
  });

  it("a second empty Save puts the cursor back in the name field", async () => {
    const user = userEvent.setup();
    values.current = { ...BASE };
    render(<AutomationsPage />);
    await user.click(screen.getAllByRole("button", { name: "New automation" })[0]);
    const name = screen.getByLabelText("Name");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(name).toHaveFocus());
    expect(screen.getByText("Give it a name.")).toBeInTheDocument();
    (screen.getByLabelText("3. The text that goes out") as HTMLElement).focus();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(name).toHaveFocus());
  });

  it("keeps a folder heading when all its rows are removed, with no invented empty-state text", async () => {
    const user = userEvent.setup();
    values.current = { ...BASE };
    render(<AutomationsPage />);
    const row = document.getElementById("fd-au-wf-1")!;
    await user.click(within(row).getByRole("button", { name: "Remove" }));
    await user.click(within(row).getByRole("button", { name: "Yes, remove" }));
    expect(document.getElementById("fd-au-wf-1")).toBeNull();
    const headings = [...document.querySelectorAll(".fd-lgh")].map((h) => h.textContent);
    expect(headings).toEqual(["Lead Capture", "Instant Replies", "Follow-Up + Booking", "Reviews", "Campaigns", "AI Agents"]);
    expect(document.body.textContent).not.toMatch(/No automations here/);
  });

  it("a row's menu holds the design's actions: the switch, Edit, then Remove last", async () => {
    values.current = { ...BASE };
    render(<GestureLayer><AutomationsPage /></GestureLayer>);
    const row = document.getElementById("fd-au-wf-3")!;
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
    const menu = screen.getByRole("menu", { name: "Actions for Owner ping" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["Owner ping", "Edit", "Remove"]);
    expect(items[2]).toHaveClass("is-bad");
    fireEvent.click(items[0]);
    await waitFor(() => expect(screen.getByRole("switch", { name: "Owner ping" })).toHaveAttribute("aria-checked", "false"));
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
    fireEvent.click(screen.getAllByRole("menuitem")[2]);
    await waitFor(() => expect(within(row).getByText("Remove it?")).not.toHaveClass("is-off"));
    fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Owner ping", "Keep", "Yes, remove"]);
  });
});
