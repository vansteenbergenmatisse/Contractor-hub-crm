// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    usePushed: () => {},
    useShell: () => ({ updateBusiness: vi.fn(), signOut: vi.fn() }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { SettingsPage } from "@/features/settings";
import { initialState, settingsReducer } from "../../../src/features/settings/api/state";

afterEach(cleanup);

// r6 finding 7: kept state must take newer server values for keys the owner has not edited, so a
// later copy or HighLevel edit shows up. Made-up values only.
describe("newer server values", () => {
  it("replace kept values the owner did not edit, and keep an unsaved edit", async () => {
    const tree = (values: Record<string, string>, on: boolean) => (
      <PageStateProvider>{on ? <SettingsPage initialValues={values} initialSection="biz" loadStatus="ok" saveValues={vi.fn()} /> : null}</PageStateProvider>
    );
    const view = render(tree({ business_name: "", business_owner_name: "", business_email: "" }, true));
    await userEvent.setup().type(screen.getByLabelText(/^Owner name/), "Typed");
    view.rerender(tree({}, false));
    view.rerender(tree({ business_name: "Test Co", business_owner_name: "Stored", business_email: "" }, true));
    await waitFor(() => expect(screen.getByLabelText(/^Business name/)).toHaveValue("Test Co"));
    expect(screen.getByLabelText(/^Owner name/)).toHaveValue("Typed");
  });

  it("the reducer takes server values only where the field has no unsaved edit", () => {
    const s = { ...initialState({ a: "", b: "", c: "x" }), draft: { a: "", b: "edited", c: "x" } };
    const next = settingsReducer(s, { type: "serverValues", values: { a: "new", b: "server", c: "x", d: "added" } });
    expect(next.values).toEqual({ a: "new", b: "", c: "x", d: "added" });
    expect(next.draft).toEqual({ a: "new", b: "edited", c: "x", d: "added" });
  });
});
