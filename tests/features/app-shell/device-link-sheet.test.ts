import { describe, expect, it, vi } from "vitest";
import { requestPairingLink } from "../../../src/features/app-shell/components/DeviceLinkSheet";

// "Open on my phone or laptop" asks the server for the pairing link and maps every answer to a state.
const reply = (status: number, body: unknown = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("requestPairingLink", () => {
  it("POSTs same-origin JSON to /api/auth/device-pairing and returns the link", async () => {
    const fetchImpl = reply(200, { link: "https://crm.example.test/device-sign-in#t=x", expiresAt: "2026-11-24T10:05:00.000Z" });
    expect(await requestPairingLink(fetchImpl)).toEqual({ kind: "ready", link: "https://crm.example.test/device-sign-in#t=x", expiresAt: "2026-11-24T10:05:00.000Z" });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/auth/device-pairing");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
  });

  it.each([
    [429, "Too many links"],
    [401, "signed out"],
    [403, "cannot make a sign-in link"],
    [500, "Could not make a link"],
  ])("explains a %s answer", async (status, text) => {
    const state = await requestPairingLink(reply(status));
    expect(state.kind).toBe("error");
    expect(state.kind === "error" && state.message).toContain(text);
  });

  it("explains a lost connection", async () => {
    const state = await requestPairingLink(vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch);
    expect(state).toEqual({ kind: "error", message: "No connection. Check your internet and try again." });
  });
});
