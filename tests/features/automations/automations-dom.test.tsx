// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
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
    useBusiness: () => ({ googleReviewUrl: null }),
    usePushed: () => {},
    PageAction: () => null,
  };
});

import { AppShell, buildBusiness } from "@/features/app-shell";
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

  it("puts the referral reward into the test text when it is set", async () => {
    const user = userEvent.setup();
    values.current = { ...BASE, referral_reward_text: "You both get a free check." };
    render(<AutomationsPage />);
    const edits = screen.getAllByRole("button", { name: "Edit" });
    const names = screen.getAllByText(/./, { selector: ".fd-rn .fd-h" }).map((n) => n.textContent);
    await user.click(edits[names.indexOf("Referral ask")]);
    await user.click(screen.getByRole("button", { name: "Send me a test" }));
    expect(screen.getByText(/Reply YES\. You both get a free check\./)).toBeInTheDocument();
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
});
