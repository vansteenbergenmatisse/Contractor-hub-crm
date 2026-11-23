// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
const updateBusiness = vi.fn();
const signOut = vi.fn(async () => {});
// The real kept-state store; the rest of the shell is replaced.
vi.mock("@/features/app-shell", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/app-shell")>();
  return {
    usePushed: () => {},
    useShell: () => ({ updateBusiness, signOut }),
    useKeptReducer: real.useKeptReducer,
    PageStateProvider: real.PageStateProvider,
  };
});

import { PageStateProvider } from "@/features/app-shell";
import { SettingsPage } from "@/features/settings";
import type { SectionKey } from "@/features/settings";
import { LIVE_STYLE_ID, applyBrandToDocument } from "../../../src/features/settings/api/live-save";

// No test depends on another: the live colors, the live style and the mocks start clean each time.
function resetDocument() {
  document.documentElement.removeAttribute("style");
  document.getElementById(LIVE_STYLE_ID)?.remove();
}
beforeEach(() => {
  resetDocument();
  updateBusiness.mockReset();
  signOut.mockClear();
});
afterEach(() => {
  cleanup();
  resetDocument();
  vi.restoreAllMocks();
});

// Made-up values only.
describe("Settings in the browser", () => {
  it("a new client with no values saves one brand color", async () => {
    const user = userEvent.setup();
    render(<SettingsPage initialValues={{}} initialSection="colors" />);
    const field = screen.getByLabelText(/^Main color/);
    await user.type(field, "#1565C0");
    await user.click(screen.getByRole("button", { name: "Apply for this visit" }));
    expect(screen.getByRole("alert")).toHaveClass("is-off");
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText("Changed for this visit only. Not saved to your account yet.").closest("p")).not.toHaveClass("is-off");
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
    await user.click(screen.getByRole("button", { name: "Apply for this visit" }));
    const frame = screen.getByTestId("frame");
    expect(getComputedStyle(frame).getPropertyValue("--main-color").trim()).toBe("#1565C0");
    css.remove();
  });

  it("names a bad field by its label, once, next to the field, marks it and puts the cursor in it", async () => {
    const user = userEvent.setup();
    render(<SettingsPage initialValues={{}} initialSection="colors" />);
    const field = screen.getByLabelText(/^Main, pressed/);
    await user.type(field, "blue");
    await user.click(screen.getByRole("button", { name: "Apply for this visit" }));
    const msg = "Main, pressed needs a color like #2E7D32.";
    expect(screen.getAllByText(msg)).toHaveLength(1);
    expect(screen.getByText(msg)).toHaveAttribute("role", "alert");
    expect(screen.getByText(msg)).toHaveAttribute("id", "cv-main_hover_color-err");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription(msg);
    expect(field).toHaveFocus();
  });

  it("applies nothing until Save", async () => {
    const user = userEvent.setup();
    render(<SettingsPage initialValues={{ business_name: "Test Co" }} initialSection="colors" />);
    await user.type(screen.getByLabelText(/^Main color/), "#1565C0");
    expect(document.documentElement.style.getPropertyValue("--main-color")).toBe("");
    expect(document.getElementById(LIVE_STYLE_ID)).toBeNull();
    expect(updateBusiness).not.toHaveBeenCalled();
  });

  it("hides the result line on a new edit and says the changes are not saved", async () => {
    const user = userEvent.setup();
    render(<SettingsPage initialValues={{ business_name: "Test Co" }} initialSection="biz" />);
    await user.type(screen.getByLabelText(/^Business name/), " Two");
    await user.click(screen.getByRole("button", { name: "Apply for this visit" }));
    const ok = screen.getByText("Changed for this visit only. Not saved to your account yet.").closest("p");
    expect(ok).not.toHaveClass("is-off");
    expect(ok?.closest(".fd-cvsv")).not.toBeNull();
    expect(screen.getByText("Changes last until you close or reload this page.")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Email/), "a@b.example");
    expect(ok).toHaveClass("is-off");
    expect(screen.getByText("You have changes that are not applied yet.")).toHaveAttribute("role", "status");
    await user.click(screen.getByRole("button", { name: "Apply for this visit" }));
    expect(ok).not.toHaveClass("is-off");
    expect(screen.queryByText("You have changes that are not applied yet.")).toBeNull();
  });

  it("does not say anything changed when applying with no edits", async () => {
    const user = userEvent.setup();
    render(<SettingsPage initialValues={{ business_name: "Test Co" }} initialSection="biz" />);
    await user.click(screen.getByRole("button", { name: "Apply for this visit" }));
    expect(screen.getByText("Changed for this visit only. Not saved to your account yet.").closest("p")).toHaveClass("is-off");
    expect(updateBusiness).not.toHaveBeenCalled();
  });

  it("removes the inline error as soon as its field is edited", async () => {
    const user = userEvent.setup();
    render(<SettingsPage initialValues={{}} initialSection="colors" />);
    const field = screen.getByLabelText(/^Main, pressed/);
    await user.type(field, "blue");
    await user.click(screen.getByRole("button", { name: "Apply for this visit" }));
    expect(field).toHaveAttribute("aria-invalid", "true");
    await user.clear(field);
    expect(field).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Main, pressed needs a color like #2E7D32.")).toBeNull();
  });

  it("marks only the sections that hold unsaved changes", async () => {
    const user = userEvent.setup();
    render(<SettingsPage initialValues={{ business_name: "Test Co", business_latitude: "1" }} initialSection="colors" />);
    expect(screen.queryByText("Not applied yet")).toBeNull();
    await user.type(screen.getByLabelText(/^Main color/), "#123456");
    expect(screen.getByRole("button", { name: /Brand colors/ })).toHaveTextContent("Not applied yet");
    expect(screen.getByRole("button", { name: /Business details/ })).not.toHaveTextContent("Not applied yet");
    // A key outside the design's list belongs to Business details.
    await user.type(screen.getByLabelText(/^Business latitude/), "2");
    expect(screen.getByRole("button", { name: /Business details/ })).toHaveTextContent("Not applied yet");
    await user.clear(screen.getByLabelText(/^Main color/));
    expect(screen.getByRole("button", { name: /Brand colors/ })).not.toHaveTextContent("Not applied yet");
  });

  it("never adds a second live style, also after two saves", () => {
    applyBrandToDocument(document, { main_color: "#111111" });
    applyBrandToDocument(document, { main_color: "#222222" });
    expect(document.querySelectorAll(`#${LIVE_STYLE_ID}`)).toHaveLength(1);
    expect(document.getElementById(LIVE_STYLE_ID)!.textContent).toContain("--main-color:#222222");
  });

  it("Sign out ends the session through the shell, then loads /sign-in as a full page", async () => {
    const user = userEvent.setup();
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    render(<SettingsPage initialValues={{}} />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(assign).toHaveBeenCalledWith(new URL("/sign-in", window.location.href).href));
  });

  it("Sign out stays on the page when the shell could not end the session", async () => {
    const user = userEvent.setup();
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    signOut.mockRejectedValueOnce(new Error("Sign-out failed"));
    render(<SettingsPage initialValues={{}} />);
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
    expect(await screen.findByText("Could not sign out. Try again.")).toHaveAttribute("role", "alert");
    // The next attempt clears the message.
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Could not sign out. Try again.")).toBeNull();
  });

  it("a ?section= link opens its section even when the kept state has it, and again after Back", async () => {
    const user = userEvent.setup();
    function Host() {
      const [on, setOn] = useState(true);
      const [sec, setSec] = useState<SectionKey | undefined>(undefined);
      return (
        <PageStateProvider>
          <button type="button" onClick={() => setOn((x) => !x)}>toggle</button>
          <button type="button" onClick={() => setSec("conn")}>go connections</button>
          {on ? <SettingsPage initialValues={{}} initialSection={sec} /> : <input aria-label="other" />}
        </PageStateProvider>
      );
    }
    const { container } = render(<Host />);
    const view = () => container.querySelector(".fd-view[data-sec]")!;
    // Open Connections, then Back (the kept state now has Connections, closed).
    await user.click(screen.getByRole("button", { name: /Connections/ }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(view()).toHaveAttribute("data-open", "0");
    await user.click(screen.getByRole("button", { name: "toggle" }));
    await user.click(screen.getByRole("button", { name: "go connections" }));
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(view()).toHaveAttribute("data-sec", "conn");
    expect(view()).toHaveAttribute("data-open", "1");
    // Back, leave and come back with the same link: it opens again.
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "toggle" }));
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(view()).toHaveAttribute("data-open", "1");
  });

  it("a focus request left from an earlier visit does not move the cursor on arrival", async () => {
    const user = userEvent.setup();
    function Host() {
      const [on, setOn] = useState(true);
      return (
        <PageStateProvider>
          <button type="button" onClick={() => setOn((x) => !x)}>toggle</button>
          {on ? <SettingsPage initialValues={{}} initialSection="colors" /> : null}
          <input aria-label="other" />
        </PageStateProvider>
      );
    }
    render(<Host />);
    await user.type(screen.getByLabelText(/^Main, pressed/), "blue");
    await user.click(screen.getByRole("button", { name: "Apply for this visit" }));
    expect(screen.getByLabelText(/^Main, pressed/)).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "toggle" }));
    screen.getByLabelText("other").focus();
    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByLabelText(/^Main, pressed/)).not.toHaveFocus();
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
