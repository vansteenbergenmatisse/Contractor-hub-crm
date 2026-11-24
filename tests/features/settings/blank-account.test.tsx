// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

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
import { COLOR_KEYS, ESSENTIAL_KEYS, SettingsPage, type LoadStatus } from "@/features/settings";

afterEach(cleanup);

// Requirements 5 and 6: a sub-account whose values are all blank shows empty fields ready to fill.
// "Your details did not load" is only for a real failure. Made-up values only.
const blank = Object.fromEntries([...ESSENTIAL_KEYS, ...COLOR_KEYS].map((key) => [key, ""]));
const page = (values: Record<string, string>, status: LoadStatus | undefined, live: boolean) =>
  render(
    <PageStateProvider>
      <SettingsPage initialValues={values} initialSection="biz" loadStatus={status} saveValues={live ? vi.fn() : undefined} />
    </PageStateProvider>,
  );

describe("Settings for a blank sub-account", () => {
  it("shows the empty fields and lets a live owner save when every value is blank", () => {
    page(blank, "ok", true);
    expect(screen.queryByText(/did not load/)).toBeNull();
    expect(screen.getByLabelText(/^Business name/)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save Business" })).toBeEnabled();
  });

  it("shows empty fields and allows saving when HighLevel answered with no rows", () => {
    page({}, "empty", true);
    expect(screen.queryByText(/did not load/)).toBeNull();
    expect(screen.getByLabelText(/^Business name/)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save Business" })).toBeEnabled();
  });

  it("says did not load on a real failure and blocks a live save", () => {
    page({}, "failed", true);
    expect(screen.getByRole("alert")).toHaveTextContent("Your details did not load");
    expect(screen.getByRole("button", { name: "Save Business" })).toBeDisabled();
  });

  it("says did not load on a real failure for an owner who cannot save to the account too", () => {
    page({}, "failed", false);
    expect(screen.getByRole("alert")).toHaveTextContent("Your details did not load");
  });

  it("says the account is not connected, instead of did not load", () => {
    page({}, "not-connected", true);
    expect(screen.getByRole("alert")).toHaveTextContent("not connected");
    expect(screen.queryByText(/did not load/)).toBeNull();
    expect(screen.getByRole("button", { name: "Save Business" })).toBeDisabled();
  });
});
