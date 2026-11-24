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
import { SettingsPage, type AccountLayout } from "@/features/settings";

afterEach(cleanup);

// Wave E review: an unsaved draft kept across navigation must not hide behind a lock that arrives
// later (the step would stay dirty with a draft the owner can neither see nor undo). Made-up values.
describe("a draft on a key that gets locked", () => {
  it("is dropped, so the locked field and the step show the saved value", async () => {
    const user = userEvent.setup();
    const values = { business_name: "Test Co", business_email: "a@example.test" };
    const ui = (account: AccountLayout) => <PageStateProvider><SettingsPage initialValues={values} account={account} /></PageStateProvider>;
    const { rerender } = render(ui({ imageHosts: [] }));
    const name = screen.getByLabelText("Business name");
    await user.clear(name);
    await user.type(name, "Draft Co");
    rerender(ui({ imageHosts: [], lockedKeys: ["business_name"] }));
    expect(screen.getByLabelText("Business name")).toHaveValue("Test Co");
    rerender(ui({ imageHosts: [] }));
    expect(screen.getByLabelText("Business name")).toHaveValue("Test Co");
  });
});
