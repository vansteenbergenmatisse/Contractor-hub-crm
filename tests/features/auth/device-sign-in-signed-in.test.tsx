// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeviceSignIn } from "@/features/auth";

// /device-sign-in when this device already has a session. With a token, Continue is always offered and
// the redeem replaces the old session (a framed do-not-remember one, or another user's) with a long
// first-party one. Without a token there is nothing to redeem: a signed-in visitor goes to the app once.
const TOKEN = "Q".repeat(43);

// The page asks the preview first (not spending the token); only the redeem spends it.
const PREVIEW_OK = JSON.stringify({ kind: "handoff", person: "o•••@example.test", business: null, sameAsCurrent: null });
const routedFetch = (redeemStatus: number) =>
  vi.fn(async (url: string) =>
    url === "/api/auth/device-sign-in-preview" ? new Response(PREVIEW_OK, { status: 200 }) : new Response("{}", { status: redeemStatus }),
  );
const redeemCalls = (mock: ReturnType<typeof routedFetch>) => mock.mock.calls.filter(([url]) => url === "/api/auth/device-sign-in");

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("DeviceSignIn with an existing session", () => {
  it("offers Continue for a token and redeems it, instead of skipping to the app", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    const goTo = vi.fn();
    const fetchMock = routedFetch(200);
    vi.stubGlobal("fetch", fetchMock);
    render(<DeviceSignIn signedIn goTo={goTo} />);
    const button = await screen.findByRole("button", { name: "Continue" });
    expect(goTo).not.toHaveBeenCalled();
    expect(redeemCalls(fetchMock)).toHaveLength(0);
    fireEvent.click(button);
    await waitFor(() => expect(goTo).toHaveBeenCalledWith("/"));
    expect(redeemCalls(fetchMock)).toHaveLength(1);
    expect(goTo).toHaveBeenCalledTimes(1);
  });

  it("goes to the app once when signed in and there is no token", async () => {
    window.history.replaceState(null, "", "/device-sign-in");
    const goTo = vi.fn();
    render(<DeviceSignIn signedIn goTo={goTo} />);
    await waitFor(() => expect(goTo).toHaveBeenCalledWith("/"));
    expect(goTo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("does not navigate a signed-out visitor without a token", async () => {
    window.history.replaceState(null, "", "/device-sign-in");
    const goTo = vi.fn();
    render(<DeviceSignIn goTo={goTo} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("not complete");
    expect(goTo).not.toHaveBeenCalled();
  });

  it("stays on the page when the redeem fails, even with a session", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    const goTo = vi.fn();
    vi.stubGlobal("fetch", routedFetch(403));
    render(<DeviceSignIn signedIn goTo={goTo} />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("expired or was already used");
    expect(goTo).not.toHaveBeenCalled();
  });
});
