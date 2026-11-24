// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DeviceSignIn } from "@/features/auth";

// /device-sign-in says who and which business a link signs in before the tap, and warns when another
// person is signed in on this device. The preview never spends the token; only Continue does.
const TOKEN = "Z".repeat(43);
const PREVIEW = "/api/auth/device-sign-in-preview";
const REDEEM = "/api/auth/device-sign-in";

type Preview = { kind: string; person: string; business: string | null; sameAsCurrent: boolean | null };

function stubFetch(preview: Preview | number, redeemStatus = 200) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === PREVIEW) {
      return typeof preview === "number" ? new Response("{}", { status: preview }) : new Response(JSON.stringify(preview), { status: 200 });
    }
    return new Response("{}", { status: redeemStatus });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    calls: (path: string) => fetchMock.mock.calls.filter(([url]) => url === path) as unknown as Array<[string, RequestInit]>,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("DeviceSignIn preview", () => {
  it("asks the preview with the token, then shows the person and the business", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    const { calls } = stubFetch({ kind: "pairing", person: "j•••@gmail.com", business: "Green Lane Roofing", sameAsCurrent: null });
    render(<DeviceSignIn />);
    expect(await screen.findByText("This link signs in j•••@gmail.com at Green Lane Roofing.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(window.location.hash).toBe("");
    expect(calls(PREVIEW)).toHaveLength(1);
    const [, init] = calls(PREVIEW)[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ token: TOKEN });
    expect(calls(REDEEM)).toHaveLength(0);
  });

  it("leaves out the business when it is unknown", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    stubFetch({ kind: "handoff", person: "j•••@gmail.com", business: null, sameAsCurrent: null });
    render(<DeviceSignIn />);
    expect(await screen.findByText("This link signs in j•••@gmail.com.")).toBeTruthy();
  });

  it("warns when another person is signed in, with Continue as and Stay signed in as", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    const goTo = vi.fn();
    const { calls } = stubFetch({ kind: "pairing", person: "j•••@gmail.com", business: "Green Lane Roofing", sameAsCurrent: false });
    render(<DeviceSignIn signedIn currentPerson="m•••@outlook.com" goTo={goTo} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You are signed in as m•••@outlook.com on this device. Continue signs you in as j•••@gmail.com instead.",
    );
    const stay = screen.getByRole("link", { name: "Stay signed in as m•••@outlook.com" });
    expect(stay.getAttribute("href")).toBe("/");
    expect(goTo).not.toHaveBeenCalled();
    expect(calls(REDEEM)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Continue as j•••@gmail.com" }));
    await waitFor(() => expect(goTo).toHaveBeenCalledWith("/"));
    expect(calls(REDEEM)).toHaveLength(1);
  });

  it("shows no warning when the same person is already signed in", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    stubFetch({ kind: "handoff", person: "j•••@gmail.com", business: "Green Lane Roofing", sameAsCurrent: true });
    render(<DeviceSignIn signedIn currentPerson="j•••@gmail.com" goTo={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Continue" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("link", { name: /Stay signed in/ })).toBeNull();
  });

  it("shows the expired message and no Continue when the preview is refused", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    const { calls } = stubFetch(403);
    render(<DeviceSignIn />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This link has expired or was already used");
    expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to sign in" }).getAttribute("href")).toBe("/sign-in");
    expect(calls(REDEEM)).toHaveLength(0);
  });

  it("keeps the too-many-tries and offline messages for the preview, with no Continue", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    stubFetch(429);
    const { unmount } = render(<DeviceSignIn />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many tries");
    expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
    unmount();

    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    render(<DeviceSignIn />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No connection");
    expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
  });
});
