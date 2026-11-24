// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startHandshake, type HandshakeDeps } from "../../../src/features/embed/api/handshake";
import { EMBED_DENIAL_CODES, EMBED_DENIAL_HEADER, EMBED_DENIAL_MESSAGES, type EmbedDenialCode } from "../../../src/features/embed/api/denial";

// Every refused sign-in inside HighLevel says why, with its own next step.
const EXPECTED: Record<EmbedDenialCode, string> = {
  agency_user:
    "You are signed in with an agency login. This CRM only opens for this business's own team. Ask the business owner to add you as a team member with a different email, then sign in to HighLevel with that login.",
  not_in_location:
    "Your HighLevel user is not part of this business yet. Ask the business owner to add you as a team member in HighLevel, then open CRM again.",
  login_off: "This CRM is turned off for this business. Ask Forge Forward to turn it on.",
  not_connected: "This business is not connected to the CRM yet. Ask Forge Forward to connect it.",
  user_off: "Your access to this CRM is turned off. Ask Forge Forward to turn it back on.",
  account_conflict: "Ask Forge Forward to fix this: your email is already linked to another CRM.",
  other: "We could not sign you in. Tap Try again. If it keeps happening, ask Forge Forward.",
};

describe("denial messages", () => {
  it.each(EMBED_DENIAL_CODES)("%s has its own clear message", (code) => {
    expect(EMBED_DENIAL_MESSAGES[code]).toBe(EXPECTED[code]);
  });

  it("every code has its own text and none names an unverified HighLevel menu path", () => {
    expect(new Set(Object.values(EMBED_DENIAL_MESSAGES)).size).toBe(EMBED_DENIAL_CODES.length);
    for (const message of Object.values(EMBED_DENIAL_MESSAGES)) expect(message).not.toMatch(/Settings >|My Staff/);
  });

  it("only sends people to Forge Forward where Forge Forward is the fix", () => {
    expect(EMBED_DENIAL_MESSAGES.agency_user).not.toMatch(/Forge Forward/);
    expect(EMBED_DENIAL_MESSAGES.not_in_location).not.toMatch(/Forge Forward/);
  });
});

describe("handshake passes the server's reason code on", () => {
  afterEach(() => vi.useRealTimers());

  function run(response: () => Promise<{ ok: boolean; status: number; headers?: { get(name: string): string | null } }>) {
    vi.useFakeTimers();
    const parent = { postMessage: vi.fn() };
    let handler: ((event: { source: unknown; data: unknown }) => void) | null = null;
    const results: [string, string | undefined][] = [];
    const deps: HandshakeDeps = {
      parent,
      self: {},
      listen: (h) => {
        handler = h;
        return () => {};
      },
      fetchImpl: vi.fn(response),
      onResult: (result, denial) => results.push([result, denial]),
      retryEveryMs: 1000,
      giveUpAfterMs: 5000,
    };
    startHandshake(deps);
    handler!({ source: parent, data: { message: "REQUEST_USER_DATA_RESPONSE", payload: "cipher" } });
    return results;
  }

  const headers = (value: string | null) => ({ get: (name: string) => (name.toLowerCase() === EMBED_DENIAL_HEADER ? value : null) });

  it("a 403 with a known code reports that code", async () => {
    const results = run(async () => ({ ok: false, status: 403, headers: headers("agency_user") }));
    await vi.waitFor(() => expect(results).toEqual([["no_access", "agency_user"]]));
  });

  it("an unknown code, no header, a 500 or a failed request report other", async () => {
    for (const response of [
      async () => ({ ok: false, status: 403, headers: headers("<script>") }),
      async () => ({ ok: false, status: 403 }),
      async () => ({ ok: false, status: 500, headers: headers("agency_user") }),
      async () => {
        throw new Error("offline");
      },
    ]) {
      const results = run(response);
      await vi.waitFor(() => expect(results).toEqual([["no_access", "other"]]));
      vi.useRealTimers();
    }
  });
});

describe("EmbedBridge shows the message for the code", () => {
  it.each(EMBED_DENIAL_CODES)("%s", async (code) => {
    vi.resetModules();
    const captured: HandshakeDeps[] = [];
    vi.doMock("../../../src/features/embed/api/handshake", () => ({
      startHandshake: (deps: HandshakeDeps) => {
        captured.push(deps);
        return () => {};
      },
    }));
    const { EmbedBridge } = await import("../../../src/features/embed/components/EmbedBridge");
    const goTo = vi.fn();
    const { unmount } = render(<EmbedBridge goTo={goTo} />);
    act(() => captured[0].onResult("no_access", code));
    expect(screen.getByRole("status")).toHaveTextContent(EMBED_DENIAL_MESSAGES[code]);
    expect(goTo).not.toHaveBeenCalled();
    // One obvious action on every refusal: Try again runs the /embed sign-in again.
    act(() => screen.getByRole("button", { name: "Try again" }).click());
    expect(goTo).toHaveBeenCalledWith("/embed");
    unmount();
    vi.doUnmock("../../../src/features/embed/api/handshake");
  });
});
