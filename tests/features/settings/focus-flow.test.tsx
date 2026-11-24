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

afterEach(cleanup);

// Made-up values only.
const VALUES: Record<string, string> = {
  business_name: "Test Co",
  business_phone_number: "111",
  residentialservice1: "Service one",
  residentialservice2: "",
};
const allSaved: SaveValues = async (changes) => ({ kind: "results", results: changes.map(({ key }) => ({ key, status: "saved" as const })) });
const page = (extra: Partial<React.ComponentProps<typeof SettingsPage>> = {}) =>
  render(<PageStateProvider><SettingsPage initialValues={VALUES} {...extra} /></PageStateProvider>);
const unlockName = "Unlock Residential services to change";

describe("protected folder focus", () => {
  it("keeps focus in the folder at every stage", async () => {
    const user = userEvent.setup();
    page({ saveValues: allSaved });
    await user.click(screen.getByRole("button", { name: unlockName }));
    expect(document.activeElement).toBe(screen.getByRole("checkbox"));

    await user.keyboard(" ");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    const first = document.getElementById("cv-residentialservice1") as HTMLInputElement;
    await waitFor(() => expect(document.activeElement).toBe(first));

    await user.clear(first);
    await user.type(first, "Service new");
    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    expect(document.activeElement).toBe(screen.getByText("Check your changes"));

    await user.click(screen.getByRole("button", { name: "Back to editing" }));
    expect(document.activeElement).toBe(first);

    await user.click(screen.getByRole("button", { name: "Check my changes" }));
    await user.click(screen.getByRole("button", { name: "Save Residential services" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: unlockName })));
  });

  it("returns focus to Unlock when the folder is kept locked", async () => {
    const user = userEvent.setup();
    page();
    await user.click(screen.getByRole("button", { name: unlockName }));
    await user.click(screen.getByRole("button", { name: "Keep it locked" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: unlockName }));
  });

  it("announces the stage", async () => {
    const user = userEvent.setup();
    page();
    await user.click(screen.getByRole("button", { name: unlockName }));
    const folder = within(document.getElementById("s-card-res") ?? document.body);
    expect(folder.getByRole("status").textContent).not.toBe("");
  });
});

describe("the step sheet", () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    const trigger = screen.getByRole("button", { name: /Jump to a step/ });
    await user.click(trigger);
    return { trigger, dialog: screen.getByRole("dialog", { name: "Jump to a step" }) };
  };

  it("is a modal dialog with focus inside", async () => {
    const user = userEvent.setup();
    page();
    const { dialog } = await open(user);
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("keeps Tab inside", async () => {
    const user = userEvent.setup();
    page();
    const { dialog } = await open(user);
    const count = dialog.querySelectorAll("button:not([disabled])").length;
    for (let i = 0; i < count + 2; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it("closes on Escape and gives focus back", async () => {
    const user = userEvent.setup();
    page();
    const { trigger } = await open(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("moves focus to the chosen step", async () => {
    const user = userEvent.setup();
    page();
    const { dialog } = await open(user);
    await user.click(within(dialog).getByRole("button", { name: /Brand colors/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById("s-t-col")));
  });
});

describe("field columns", () => {
  const css = readFileSync(join(process.cwd(), "src/features/settings/components/settings-guided.css"), "utf8");

  it("uses one column on a phone and two from 640px", () => {
    expect(css).toMatch(/@media \(max-width: 639px\)\{\s*\.sv-fields\{grid-template-columns:minmax\(0,1fr\)\}/);
    expect(css).toMatch(/@media \(min-width: 640px\) and \(max-width: 1023px\)\{\s*\.sv-fields\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  });
});
