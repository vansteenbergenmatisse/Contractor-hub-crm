// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    useShell: () => ({ updateBusiness: vi.fn(), signOut: vi.fn() }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { SettingsPage, type AccountLayout, type SaveValues } from "@/features/settings";

afterEach(cleanup);

// Wave E: a key Forge Forward locked shows read-only with who to ask. Made-up values.
const NOTE = "Locked by Forge Forward. Ask us to change it.";
const page = (values: Record<string, string>, account: AccountLayout, saveValues?: SaveValues) =>
  render(<PageStateProvider><SettingsPage initialValues={values} account={account} saveValues={saveValues} /></PageStateProvider>);

describe("locked values on the owner's Settings page", () => {
  it("shows a locked key read-only with the note, and leaves the others editable", () => {
    page({ business_name: "Test Co", business_email: "a@example.test" }, { imageHosts: [], lockedKeys: ["business_name"] });
    const name = screen.getByLabelText("Business name");
    expect(name).toHaveAttribute("readonly");
    expect(name).toHaveValue("Test Co");
    expect(screen.getByText(NOTE)).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("readonly");
  });

  it("shows a locked key inside a protected folder read-only even after the unlock step", async () => {
    const user = userEvent.setup();
    const send = vi.fn<SaveValues>(async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "saved" as const })) }));
    page({ business_name: "Test Co", residentialservice1: "Mowing", residentialservice2: "Edging" }, { imageHosts: [], lockedKeys: ["residentialservice1"] }, send);
    await user.click(screen.getByRole("button", { name: "Unlock Residential services to change" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(screen.getByLabelText("Residential service 1")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Residential service 2")).not.toHaveAttribute("readonly");
    expect(screen.getByText(NOTE)).toBeInTheDocument();
  });

  it("marks nothing locked without a lock list", () => {
    page({ business_name: "Test Co" }, { imageHosts: [] });
    expect(screen.getByLabelText("Business name")).not.toHaveAttribute("readonly");
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});
