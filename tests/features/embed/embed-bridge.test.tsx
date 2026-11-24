// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandshakeDeps, HandshakeResult } from "../../../src/features/embed/api/handshake";

// The /embed page in the browser, after the handshake: framed with a handoff token it tries to move the
// top window and always offers Open full screen / Open in a new tab / Use it here; without a token it
// goes straight to the app inside the frame.
const { startHandshake, tryTopNavigation } = vi.hoisted(() => ({
  startHandshake: vi.fn<(deps: HandshakeDeps) => () => void>(() => () => {}),
  tryTopNavigation: vi.fn(() => false),
}));

vi.mock("../../../src/features/embed/api/handshake", () => ({ startHandshake }));
vi.mock("../../../src/features/embed/api/full-screen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../src/features/embed/api/full-screen")>()),
  tryTopNavigation,
}));

import { EmbedBridge } from "../../../src/features/embed/components/EmbedBridge";

const TOKEN = "H".repeat(43);

function deps(): HandshakeDeps {
  expect(startHandshake).toHaveBeenCalledTimes(1);
  return startHandshake.mock.calls[0][0];
}

function finish(result: HandshakeResult, token?: string) {
  const d = deps();
  act(() => {
    if (token) d.onHandoff?.(token);
    d.onResult(result);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tryTopNavigation.mockReturnValue(false);
});

describe("EmbedBridge", () => {
  it("shows 'Signing you in' while the handshake runs", () => {
    render(<EmbedBridge goTo={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Signing you in");
  });

  it("with a handoff token: tries the top window, then offers full screen, a new tab and staying here", () => {
    const goTo = vi.fn();
    render(<EmbedBridge goTo={goTo} />);
    finish("signed_in", TOKEN);
    const url = `${window.location.origin}/device-sign-in#t=${TOKEN}`;
    expect(tryTopNavigation).toHaveBeenCalledTimes(1);
    expect(tryTopNavigation).toHaveBeenCalledWith(window.top, window, url);
    expect(goTo).not.toHaveBeenCalled();

    const full = screen.getByRole("link", { name: "Open full screen" });
    expect(full.getAttribute("href")).toBe(url);
    expect(full.getAttribute("target")).toBe("_top");
    const tab = screen.getByRole("link", { name: "Open in a new tab" });
    expect(tab.getAttribute("href")).toBe(url);
    expect(tab.getAttribute("target")).toBe("_blank");
    expect(tab.getAttribute("rel")).toContain("noopener");

    fireEvent.click(screen.getByRole("button", { name: "Use it here, inside HighLevel" }));
    expect(goTo).toHaveBeenCalledWith("/");
  });

  it("still shows the buttons when the top window moved (a page that stays is never blank)", () => {
    tryTopNavigation.mockReturnValue(true);
    render(<EmbedBridge goTo={vi.fn()} />);
    finish("signed_in", TOKEN);
    expect(screen.getByRole("link", { name: "Open full screen" })).toBeInTheDocument();
  });

  it("without a token: goes to the app in the frame, no top navigation and no buttons", () => {
    const goTo = vi.fn();
    render(<EmbedBridge goTo={goTo} />);
    finish("signed_in");
    expect(goTo).toHaveBeenCalledWith("/");
    expect(tryTopNavigation).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Open full screen" })).toBeNull();
  });

  it("shows the failure message and does not navigate when access is refused", () => {
    const goTo = vi.fn();
    render(<EmbedBridge goTo={goTo} />);
    finish("no_access");
    expect(screen.getByRole("status")).toHaveTextContent("Ask Forge Forward for access.");
    expect(goTo).not.toHaveBeenCalled();
    expect(tryTopNavigation).not.toHaveBeenCalled();
  });
});
