// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeviceSignIn } from "@/features/auth";
import { tokenFromHash } from "../../../src/features/auth/components/DeviceSignIn";

// The /device-sign-in page: the token comes from the fragment, leaves the address bar at once, and is
// only spent on a tap.
const TOKEN = "A".repeat(20) + "b".repeat(20) + "_-9";

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

describe("tokenFromHash", () => {
  it("reads a well-formed token and refuses anything else", () => {
    expect(tokenFromHash(`#t=${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromHash("#t=short")).toBeNull();
    expect(tokenFromHash("")).toBeNull();
    expect(tokenFromHash(`#x=${TOKEN}`)).toBeNull();
  });
});

describe("DeviceSignIn", () => {
  it("removes the token from the address bar and does nothing until Continue is tapped", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    const fetchMock = routedFetch(200);
    vi.stubGlobal("fetch", fetchMock);
    render(<DeviceSignIn />);
    const button = await screen.findByRole("button", { name: "Continue" });
    expect(window.location.hash).toBe("");
    expect(redeemCalls(fetchMock)).toHaveLength(0);
    fireEvent.click(button);
    await waitFor(() => expect(redeemCalls(fetchMock)).toHaveLength(1));
    const [url, init] = redeemCalls(fetchMock)[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/device-sign-in");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ token: TOKEN });
  });

  it("says the link expired or was used when the server refuses", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    vi.stubGlobal("fetch", routedFetch(403));
    render(<DeviceSignIn />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("expired or was already used");
    expect(screen.getByRole("link", { name: "Go to sign in" }).getAttribute("href")).toBe("/sign-in");
  });

  it("says the link is not complete without a token", async () => {
    window.history.replaceState(null, "", "/device-sign-in");
    render(<DeviceSignIn />);
    expect(await screen.findByRole("alert")).toHaveTextContent("not complete");
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });
});
