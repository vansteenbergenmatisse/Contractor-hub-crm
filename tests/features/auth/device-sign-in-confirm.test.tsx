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

  it("says plainly that it is a different account when both masked emails look the same", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    stubFetch({ kind: "pairing", person: "j•••@gmail.com", business: "Green Lane Roofing", sameAsCurrent: false });
    render(<DeviceSignIn signedIn currentPerson="j•••@gmail.com" goTo={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You are signed in on this device as another account (j•••@gmail.com). Continue signs you in as a different account, j•••@gmail.com, at Green Lane Roofing.",
    );
    expect(screen.getByRole("button", { name: "Continue as j•••@gmail.com" })).toBeTruthy();
  });

  it("says another person when the current one is not known", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    stubFetch({ kind: "pairing", person: "j•••@gmail.com", business: null, sameAsCurrent: false });
    render(<DeviceSignIn signedIn goTo={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You are signed in as another person on this device. Continue signs you in as j•••@gmail.com instead.",
    );
    expect(screen.getByRole("link", { name: "Stay signed in" }).getAttribute("href")).toBe("/");
  });

  it("gives a softer warning when this device has a session but the preview could not tell whose", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    stubFetch({ kind: "pairing", person: "j•••@gmail.com", business: null, sameAsCurrent: null });
    render(<DeviceSignIn signedIn currentPerson="m•••@outlook.com" goTo={vi.fn()} />);
    expect(await screen.findByText("Someone may already be signed in on this device. Continue signs you in as j•••@gmail.com.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });

  it("shows a business name with markup as plain text", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    stubFetch({ kind: "pairing", person: "j•••@gmail.com", business: "<b>Green</b> Lane", sameAsCurrent: null });
    const { container } = render(<DeviceSignIn />);
    expect(await screen.findByText("This link signs in j•••@gmail.com at <b>Green</b> Lane.")).toBeTruthy();
    expect(container.querySelector("b")).toBeNull();
  });

  it("before the tap calls only the preview, exactly once", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    const { fetchMock } = stubFetch({ kind: "pairing", person: "j•••@gmail.com", business: null, sameAsCurrent: null });
    render(<DeviceSignIn />);
    await screen.findByRole("button", { name: "Continue" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(PREVIEW);
  });

  it("redeems once on a double tap", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    const goTo = vi.fn();
    const { calls } = stubFetch({ kind: "pairing", person: "j•••@gmail.com", business: null, sameAsCurrent: null });
    render(<DeviceSignIn goTo={goTo} />);
    const button = await screen.findByRole("button", { name: "Continue" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(goTo).toHaveBeenCalledWith("/"));
    expect(calls(REDEEM)).toHaveLength(1);
  });

  it("makes no request when signed in without a token", async () => {
    window.history.replaceState(null, "", "/device-sign-in");
    const goTo = vi.fn();
    const { fetchMock } = stubFetch({ kind: "pairing", person: "j•••@gmail.com", business: null, sameAsCurrent: null });
    render(<DeviceSignIn signedIn goTo={goTo} />);
    await waitFor(() => expect(goTo).toHaveBeenCalledWith("/"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a 200 with a malformed body as an expired link", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ person: 42 }), { status: 200 })));
    render(<DeviceSignIn />);
    expect(await screen.findByRole("alert")).toHaveTextContent("This link has expired or was already used");
    expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
  });

  it("hides the Continue subtitle when there is no Continue button", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    stubFetch(403);
    render(<DeviceSignIn />);
    await screen.findByRole("alert");
    expect(screen.queryByText("Tap Continue to stay signed in on this device.")).toBeNull();
  });
});

describe("DeviceSignIn when the preview cannot answer", () => {
  const OK: Preview = { kind: "pairing", person: "j•••@gmail.com", business: null, sameAsCurrent: null };

  function stubSequence(first: number | "offline") {
    let previews = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === PREVIEW) {
        previews += 1;
        if (previews === 1) {
          if (first === "offline") throw new TypeError("offline");
          return new Response("{}", { status: first });
        }
        return new Response(JSON.stringify(OK), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return { redeems: () => fetchMock.mock.calls.filter(([url]) => url === REDEEM).length };
  }

  it("says it could not check the link on a server error, not that it expired, and Try again works", async () => {
    window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
    const { redeems } = stubSequence(500);
    render(<DeviceSignIn />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not check this link. Try again.");
    expect(screen.queryByText(/expired/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Continue/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: "Continue" })).toBeTruthy();
    expect(redeems()).toBe(0);
  });

  for (const first of ["offline", 429] as const) {
    it(`offers Try again after ${first}, then Continue once the preview answers`, async () => {
      window.history.replaceState(null, "", `/device-sign-in#t=${TOKEN}`);
      const { redeems } = stubSequence(first);
      render(<DeviceSignIn />);
      fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
      expect(await screen.findByRole("button", { name: "Continue" })).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(redeems()).toBe(0);
    });
  }
});
