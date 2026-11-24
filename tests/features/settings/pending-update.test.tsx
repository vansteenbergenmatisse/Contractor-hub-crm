// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { SettingsPage, type ImageUploader, type PrepareImage, type SaveValues } from "@/features/settings";

// The database lacks the lock table: the server answers pending_update. Made-up values only.
const PENDING = "Database update pending. Your change was not saved. Forge Forward is finishing an update; try again later.";
const HOST = "assets.cdn.filesafe.space";
const VALUES = { business_name: "Test Co", seasonal_offer_text: "Old offer", business_logo: `https://${HOST}/old-logo.png` };

beforeEach(() => {
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("owner Settings save when the database update is pending", () => {
  it("shows the pending message as an alert and sends exactly one save request", async () => {
    const send = vi.fn<SaveValues>(async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "pending_update" as const })) }));
    const user = userEvent.setup();
    render(<PageStateProvider><SettingsPage initialValues={VALUES} saveValues={send} /></PageStateProvider>);
    await user.type(screen.getByLabelText(/^Seasonal offer text/), " more");
    await user.click(within(document.querySelector(".ga-sbar") as HTMLElement).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getAllByRole("alert").some((node) => node.textContent?.includes(PENDING))).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("Change image when the database update is pending", () => {
  it("shows the pending message as an alert and sends exactly one upload", async () => {
    const uploadImage = vi.fn<ImageUploader>(async () => ({ status: "pending_update" }));
    const prepareImage = vi.fn<PrepareImage>(async () => ({ ok: true, blob: new Blob(["x"], { type: "image/webp" }), previewUrl: "blob:preview", summary: "WebP, 100 KB" }));
    render(<PageStateProvider><SettingsPage initialValues={VALUES} initialSection="biz" account={{ imageHosts: [HOST] }} uploadImage={uploadImage} prepareImage={prepareImage} /></PageStateProvider>);
    const group = screen.getByRole("group", { name: "Change Logo" });
    fireEvent.change(within(group).getByLabelText(/choose/i, { selector: "input" }), { target: { files: [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })] } });
    fireEvent.click(await within(group).findByRole("button", { name: "Save image" }));
    expect((await within(group).findByRole("alert")).textContent).toContain(PENDING);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(uploadImage).toHaveBeenCalledTimes(1);
  });
});
