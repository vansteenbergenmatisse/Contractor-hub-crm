// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const updateBusiness = vi.fn();
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
import { SettingsPage } from "@/features/settings";
import { SAVE_OFF_FOR_OFFICE, SAVE_OFF_FOR_OWNER, saveOffReason } from "@/features/settings-write-back";
import { LIVE_STYLE_ID } from "../../../src/features/settings/api/live-save";

// Requirement 3: a save either reaches the client's own HighLevel or says plainly that it did not.
// When the server says saving is off for this user, Save never pretends. Made-up values only.
const VALUES: Record<string, string> = { business_name: "Test Co", main_color: "#112233", residentialservice1: "Service one", residentialservice2: "" };
const VISIT_ONLY = "Changed for this visit only. Not saved to your account yet.";
const fetchMock = vi.fn<typeof fetch>();

const page = (reason: string) =>
  render(<PageStateProvider><SettingsPage initialValues={VALUES} initialSection="biz" saveDisabledReason={reason} /></PageStateProvider>);

function resetDocument() {
  document.documentElement.removeAttribute("style");
  document.getElementById(LIVE_STYLE_ID)?.remove();
}
beforeEach(() => {
  resetDocument();
  updateBusiness.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  resetDocument();
  vi.unstubAllGlobals();
});

describe("the reason Save is off", () => {
  it("tells an owner to ask Forge Forward and an office user that only the owner can change it", () => {
    expect(saveOffReason("owner")).toBe(SAVE_OFF_FOR_OWNER);
    expect(saveOffReason("office")).toBe(SAVE_OFF_FOR_OFFICE);
    expect(SAVE_OFF_FOR_OWNER).toMatch(/HighLevel/);
    expect(SAVE_OFF_FOR_OWNER).toMatch(/Forge Forward/);
    expect(SAVE_OFF_FOR_OFFICE).toMatch(/owner/);
  });
});

describe("Settings when saving is off for this user", () => {
  it("says so at the top instead of promising a visit-only change", () => {
    page(SAVE_OFF_FOR_OWNER);
    const text = document.body.textContent ?? "";
    expect(text).toContain(SAVE_OFF_FOR_OWNER);
    expect(text).not.toContain("Changes last until you close or reload this page.");
  });

  it("a step save marks nothing saved, calls nothing and shows the reason", async () => {
    const user = userEvent.setup();
    page(SAVE_OFF_FOR_OWNER);
    const field = screen.getByLabelText(/^Business name/);
    await user.type(field, " Two");
    await user.click(screen.getByRole("button", { name: /^(Apply|Save) Business$/ }));
    const card = within(document.getElementById("s-card-biz") as HTMLElement);
    expect(card.getByRole("alert")).toHaveTextContent(SAVE_OFF_FOR_OWNER);
    expect(screen.queryByText(VISIT_ONLY)).toBeNull();
    expect(screen.queryByText("Saved to your account.")).toBeNull();
    // The edit stays in the field as an unsaved change.
    expect(field).toHaveValue("Test Co Two");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateBusiness).not.toHaveBeenCalled();
  });

  it("does not repaint the brand colors", async () => {
    const user = userEvent.setup();
    render(<PageStateProvider><SettingsPage initialValues={VALUES} initialSection="colors" saveDisabledReason={SAVE_OFF_FOR_OFFICE} /></PageStateProvider>);
    const field = screen.getByLabelText(/^Main color/);
    await user.clear(field);
    await user.type(field, "#1565C0");
    await user.click(screen.getByRole("button", { name: /^(Apply|Save) Brand colors$/ }));
    const card = within(document.getElementById("s-card-col") as HTMLElement);
    expect(card.getByRole("alert")).toHaveTextContent(SAVE_OFF_FOR_OFFICE);
    expect(document.documentElement.style.getPropertyValue("--main-color")).toBe("");
    expect(document.getElementById(LIVE_STYLE_ID)).toBeNull();
    expect(updateBusiness).not.toHaveBeenCalled();
  });

  it("a protected folder stays open with the reason and claims nothing", async () => {
    const user = userEvent.setup();
    page(SAVE_OFF_FOR_OWNER);
    await user.click(screen.getByRole("button", { name: "Unlock Residential services to change" }));
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await user.type(screen.getByLabelText("Residential service 2"), "New");
    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    await user.click(screen.getByRole("button", { name: /^(Apply|Save) Residential services$/ }));
    const folder = within(document.getElementById("s-card-res") as HTMLElement);
    expect(await folder.findByText(SAVE_OFF_FOR_OWNER)).toBeInTheDocument();
    expect(folder.queryByText(VISIT_ONLY)).toBeNull();
    expect(screen.getByLabelText("Residential service 2")).toHaveValue("New");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
