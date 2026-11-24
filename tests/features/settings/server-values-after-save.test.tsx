// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updateBusiness = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    usePushed: () => {},
    useShell: () => ({ updateBusiness, signOut: vi.fn() }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { SettingsPage, type SaveValues } from "@/features/settings";

afterEach(() => {
  cleanup();
  updateBusiness.mockClear();
});

// Review of fix/settings-blank-values: after a good Save, `router.refresh()` can bring a server read
// that HighLevel has not caught up on yet. That stale read must not put the old value back, nor push
// the old business details to the shell. Made-up values only.
const OLD = { business_name: "Old Co", business_owner_name: "", business_email: "" };
const allSaved: SaveValues = async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "saved" as const })) });

describe("a stale server read just after a save", () => {
  it("keeps the saved value and does not re-apply the old one", async () => {
    const user = userEvent.setup();
    const tree = (values: Record<string, string>) => (
      <PageStateProvider>
        <SettingsPage initialValues={values} initialSection="biz" loadStatus="ok" saveValues={allSaved} />
      </PageStateProvider>
    );
    const view = render(tree(OLD));
    const name = screen.getByLabelText(/^Business name/);
    await user.clear(name);
    await user.type(name, "New Co");
    await user.click(screen.getByRole("button", { name: "Save Business" }));
    await waitFor(() => expect(updateBusiness).toHaveBeenCalled());
    updateBusiness.mockClear();
    // The refresh after the save returns the old value (a fresh object, as a server render would).
    view.rerender(tree({ ...OLD }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByLabelText(/^Business name/)).toHaveValue("New Co");
    expect(updateBusiness.mock.calls.some(([patch]) => JSON.stringify(patch).includes("Old Co"))).toBe(false);
  });
});
