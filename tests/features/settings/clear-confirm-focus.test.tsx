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
    useShell: () => ({ updateBusiness: vi.fn(), signOut: vi.fn() }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { SettingsPage, type SaveValues } from "@/features/settings";

// Made-up values only.
const VALUES: Record<string, string> = { business_name: "Test Co", seasonal_offer_text: "Old offer" };
const saved: SaveValues = async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "saved" as const })) });
const refused: SaveValues = async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "retry" as const })) });

afterEach(cleanup);

async function confirmClear(send: SaveValues) {
  const user = userEvent.setup();
  render(<PageStateProvider><SettingsPage initialValues={VALUES} saveValues={send} /></PageStateProvider>);
  await user.clear(screen.getByLabelText(/^Seasonal offer text/));
  await user.click(screen.getByRole("button", { name: "Save Business" }));
  await user.click(await screen.findByRole("button", { name: "Clear and save" }));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Clear and save" })).toBeNull());
}

describe("focus after Clear and save on a step card", () => {
  it("lands on the saved message inside the card", async () => {
    await confirmClear(saved);
    const card = document.getElementById("s-card-biz");
    await waitFor(() => expect(document.activeElement).toBe(card?.querySelector(".fd-okl")));
  });

  it("lands on the error message inside the card when the save fails", async () => {
    await confirmClear(refused);
    const card = document.getElementById("s-card-biz");
    await waitFor(() => expect(document.activeElement).toBe(card?.querySelector(".ga-fe")));
  });

  it("stays inside the card, on an enabled element, while the save is running", async () => {
    let finish: (answer: Awaited<ReturnType<SaveValues>>) => void = () => {};
    const slow: SaveValues = () => new Promise((resolve) => { finish = resolve; });
    await confirmClear(slow);
    const active = document.activeElement as HTMLButtonElement;
    expect(document.getElementById("s-card-biz")?.contains(active)).toBe(true);
    expect(active.disabled ?? false).toBe(false);
    finish({ kind: "results", results: [{ key: "seasonal_offer_text", status: "saved" }] });
    await waitFor(() => expect(document.querySelector("#s-card-biz .fd-okl")).not.toBeNull());
  });
});
