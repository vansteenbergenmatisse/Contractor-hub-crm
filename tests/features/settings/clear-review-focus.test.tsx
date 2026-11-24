// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const allSaved: SaveValues = async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "saved" as const })) });
const CARD_SAVE = "Save Images and offers";

const scrolled: Element[] = [];
const original = Element.prototype.scrollIntoView;
beforeEach(() => {
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { scrolled.push(this); };
});
afterEach(() => {
  cleanup();
  Element.prototype.scrollIntoView = original;
});

async function emptyOffer() {
  const user = userEvent.setup();
  const send = vi.fn(allSaved);
  render(<PageStateProvider><SettingsPage initialValues={VALUES} saveValues={send} /></PageStateProvider>);
  await user.clear(screen.getByLabelText(/^Seasonal offer text/));
  return { user, send };
}
const heading = () => screen.getByText("Check before you clear");

describe("the clear review", () => {
  it("moves focus to its heading after the card's Save", async () => {
    const { user, send } = await emptyOffer();
    await user.click(screen.getByRole("button", { name: CARD_SAVE }));
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    expect(send).not.toHaveBeenCalled();
  });

  it("scrolls the review panel into view, not the top of the card", async () => {
    const { user } = await emptyOffer();
    await user.click(screen.getByRole("button", { name: CARD_SAVE }));
    await waitFor(() => expect(scrolled.at(-1)).toBe(heading().closest(".ga-rv")));
    expect(scrolled).not.toContain(document.getElementById("s-card-img"));
  });

  it("shows the review again when the phone bar's Save is pressed twice", async () => {
    const { user } = await emptyOffer();
    const barSave = screen.getByRole("button", { name: "Save" });
    await user.click(barSave);
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    const before = scrolled.length;
    await user.click(barSave);
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    expect(scrolled.length).toBeGreaterThan(before);
  });

  it("returns focus to the card's Save on Go back", async () => {
    const { user, send } = await emptyOffer();
    const save = screen.getByRole("button", { name: CARD_SAVE });
    await user.click(save);
    await user.click(await screen.findByRole("button", { name: "Go back" }));
    await waitFor(() => expect(document.activeElement).toBe(save));
    expect(send).not.toHaveBeenCalled();
  });

  it("returns focus to the phone bar's Save on Go back when that opened it", async () => {
    const { user } = await emptyOffer();
    const barSave = screen.getByRole("button", { name: "Save" });
    await user.click(barSave);
    await user.click(await screen.findByRole("button", { name: "Go back" }));
    await waitFor(() => expect(document.activeElement).toBe(barSave));
  });
});
