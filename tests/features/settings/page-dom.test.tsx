// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const updateBusiness = vi.fn();
// The real kept-state store; the rest of the shell is replaced.
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    usePushed: () => {},
    useShell: () => ({ updateBusiness }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { SettingsPage } from "@/features/settings";

// Made-up values only.
describe("Settings in the browser", () => {
  it("a new client with no values saves one brand color", async () => {
    const user = userEvent.setup();
    render(<SettingsPage initialValues={{}} initialSection="colors" />);
    const field = screen.getByLabelText(/^Main color/);
    await user.type(field, "#1565C0");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveClass("is-off");
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText("Saved on this screen. It is not written to HighLevel yet.").closest("p")).not.toHaveClass("is-off");
    expect(document.documentElement.style.getPropertyValue("--main-color")).toBe("#1565C0");
    // The app frame (`.fd-app.brand-scope`) re-declares the default colors, so the new color must
    // reach it too: a style rule that beats `:root:root,.brand-scope` holds the saved colors.
    const live = document.getElementById("settings-brand-live");
    expect(live?.textContent).toContain(".brand-scope.brand-scope.brand-scope{--main-color:#1565C0}");
    expect(live?.parentElement).toBe(document.head);
    // An empty owner name, phone or logo is never sent to the shell as an override.
    expect(updateBusiness).toHaveBeenCalledWith({});
  });

  it("the saved color wins over the frame's default color", async () => {
    const user = userEvent.setup();
    const css = document.createElement("style");
    css.textContent = ":root:root,.brand-scope{--main-color:#2E7D32}";
    document.head.prepend(css);
    render(
      <div className="fd-app brand-scope" data-testid="frame">
        <SettingsPage initialValues={{ business_name: "Test Co" }} initialSection="colors" />
      </div>,
    );
    await user.type(screen.getByLabelText(/^Main color/), "#1565C0");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    const frame = screen.getByTestId("frame");
    expect(getComputedStyle(frame).getPropertyValue("--main-color").trim()).toBe("#1565C0");
    css.remove();
  });

  it("names a bad field by its label, marks it and puts the cursor in it", async () => {
    const user = userEvent.setup();
    render(<SettingsPage initialValues={{}} initialSection="colors" />);
    const field = screen.getByLabelText(/^Main, pressed/);
    await user.type(field, "blue");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Main, pressed needs a color like #2E7D32.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("Main, pressed needs a color like #2E7D32.");
    expect(field).toHaveFocus();
  });

  it("keeps unsaved edits and the open section when the owner leaves and comes back", async () => {
    const user = userEvent.setup();
    function Pages() {
      const [shown, setShown] = useState(true);
      return (
        <PageStateProvider>
          <button type="button" onClick={() => setShown((s) => !s)}>switch page</button>
          {shown ? <SettingsPage initialValues={{ business_name: "Test Co" }} /> : <p>other page</p>}
        </PageStateProvider>
      );
    }
    render(<Pages />);
    await user.click(screen.getByRole("button", { name: /Brand colors/ }));
    await user.type(screen.getByLabelText(/^Main color/), "#123456");
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(screen.getByText("other page")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "switch page" }));
    expect(screen.getByLabelText(/^Main color/)).toHaveValue("#123456");
    expect(screen.getByRole("button", { name: /Brand colors/ })).toHaveAttribute("aria-current", "page");
  });
});
