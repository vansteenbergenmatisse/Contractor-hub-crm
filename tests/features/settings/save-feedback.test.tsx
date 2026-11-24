// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
const VALUES: Record<string, string> = { business_name: "Test Co", seasonal_offer_text: "Old offer", residentialservice1: "Service one", residentialservice2: "" };
const allSaved: SaveValues = async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "saved" as const })) });
const SAVED = "Saved to your account.";
const FAILED = "Could not save. Nothing new was confirmed. Try again.";

const page = (saveValues?: SaveValues) => render(<PageStateProvider><SettingsPage initialValues={VALUES} saveValues={saveValues} /></PageStateProvider>);
const folder = () => within(document.getElementById("s-card-res") as HTMLElement);
const bar = () => within(document.querySelector(".ga-sbar") as HTMLElement);

async function openFolder(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Unlock Residential services to change" }));
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Unlock" }));
}

afterEach(cleanup);

describe("a protected folder without write-back", () => {
  it("makes no save or website-change claim", async () => {
    const user = userEvent.setup();
    page();
    await user.click(screen.getByRole("button", { name: "Unlock Residential services to change" }));
    expect(screen.queryByText(/My website pages change too/)).toBeNull();
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    await user.type(screen.getByLabelText("Residential service 2"), "New");
    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    expect(screen.queryByText(/Your website pages change once you save/)).toBeNull();
    expect(screen.queryByText("Save and lock")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Apply Residential services" }));
    expect(await folder().findByText("Changed for this visit only. Not saved to your account yet.", { selector: ".fd-okl span" })).toBeInTheDocument();
    expect(folder().queryByText(SAVED)).toBeNull();
  });
});

describe("a protected folder with write-back", () => {
  it("says so after a confirmed save", async () => {
    const user = userEvent.setup();
    page(vi.fn(allSaved));
    await openFolder(user);
    await user.type(screen.getByLabelText("Residential service 2"), "New");
    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    await user.click(screen.getByRole("button", { name: "Save Residential services" }));
    const message = await folder().findByText(SAVED, { selector: ".fd-okl span" });
    expect(message).toBeInTheDocument();
    await waitFor(() => expect(folder().getAllByRole("status").some((node) => node.textContent === SAVED)).toBe(true));
  });

  it("shows no success after Lock without saving", async () => {
    const user = userEvent.setup();
    page(vi.fn(allSaved));
    await openFolder(user);
    await user.type(screen.getByLabelText("Residential service 2"), "New");
    await user.click(screen.getByRole("button", { name: "Lock without saving" }));
    expect(screen.queryByText(SAVED)).toBeNull();
  });

  it("shows no success after a failed save", async () => {
    const user = userEvent.setup();
    page(vi.fn<SaveValues>(async () => ({ kind: "failed" })));
    await openFolder(user);
    await user.type(screen.getByLabelText("Residential service 2"), "New");
    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    await user.click(screen.getByRole("button", { name: "Save Residential services" }));
    expect(await screen.findByText(FAILED)).toBeInTheDocument();
    expect(screen.queryByText(SAVED)).toBeNull();
  });

  it("drops the success message when the folder is unlocked again", async () => {
    const user = userEvent.setup();
    page(vi.fn(allSaved));
    await openFolder(user);
    await user.type(screen.getByLabelText("Residential service 2"), "New");
    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    await user.click(screen.getByRole("button", { name: "Save Residential services" }));
    await folder().findByText(SAVED, { selector: ".fd-okl span" });
    await user.click(screen.getByRole("button", { name: "Unlock Residential services to change" }));
    expect(folder().queryByText(SAVED)).toBeNull();
  });
});

describe("the phone save bar", () => {
  async function editOffer(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/^Seasonal offer text/), " more");
  }

  it("shows Saving while the request runs", async () => {
    let finish: (value: Awaited<ReturnType<SaveValues>>) => void = () => {};
    const send = vi.fn<SaveValues>(() => new Promise((resolve) => { finish = resolve; }));
    const user = userEvent.setup();
    page(send);
    await editOffer(user);
    await user.click(bar().getByRole("button", { name: "Save" }));
    expect(await bar().findByRole("button", { name: "Saving Business" })).toBeDisabled();
    finish({ kind: "failed" });
    await screen.findByText(FAILED);
  });

  it("says a failure in the bar and moves focus to the message", async () => {
    const user = userEvent.setup();
    page(vi.fn<SaveValues>(async () => ({ kind: "failed" })));
    await editOffer(user);
    await user.click(bar().getByRole("button", { name: "Save" }));
    expect(await bar().findByText("Could not save")).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement?.textContent).toBe(FAILED));
  });

  it("moves focus to the confirmation after a successful save", async () => {
    const user = userEvent.setup();
    page(vi.fn(allSaved));
    await editOffer(user);
    await user.click(bar().getByRole("button", { name: "Save" }));
    await screen.findByText(SAVED);
    await waitFor(() => expect(document.activeElement?.textContent).toBe(SAVED));
  });
});

describe("scroll targets on a phone", () => {
  it("clear the sticky top bar below 1024px", () => {
    const css = readFileSync(join(process.cwd(), "src/features/settings/components/settings-guided.css"), "utf8");
    expect(css).not.toMatch(/scroll-margin-top:16px/);
    expect(css.match(/scroll-margin-top:var\(--ga-scroll-top\)/g)).toHaveLength(4);
    const phone = css.slice(css.indexOf("@media (max-width: 1023px)"));
    expect(phone).toMatch(/--ga-scroll-top:80px/);
  });
});
