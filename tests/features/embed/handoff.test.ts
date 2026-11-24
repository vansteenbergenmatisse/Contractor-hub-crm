import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fullScreenUrl, startHandshake, tryTopNavigation, type HandshakeDeps } from "@/features/embed";

// After the /embed sign-in: the handoff token from the server, and the jump to the full-screen CRM.
const TOKEN = "Z".repeat(43);

function run(body: unknown) {
  const parent = { postMessage: vi.fn() };
  let listener: (event: { source: unknown; data: unknown }) => void = () => {};
  const events: string[] = [];
  const fetchImpl = vi.fn<HandshakeDeps["fetchImpl"]>(async () => ({ ok: true, status: 200, json: async () => body }));
  startHandshake({
    parent,
    self: {},
    listen: (handler) => {
      listener = handler;
      return () => {};
    },
    fetchImpl,
    onHandoff: (token) => events.push(`handoff:${token}`),
    onResult: (result) => events.push(result),
    retryEveryMs: 1000,
    giveUpAfterMs: 5000,
  });
  listener({ source: parent, data: { message: "REQUEST_USER_DATA_RESPONSE", payload: "cipher" } });
  return events;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("handoff in the handshake", () => {
  it("passes the handoff token on before reporting signed_in", async () => {
    const events = run({ ok: true, handoff: TOKEN });
    await vi.waitFor(() => expect(events).toEqual([`handoff:${TOKEN}`, "signed_in"]));
  });

  it("reports signed_in alone without a token, or with a malformed one", async () => {
    for (const body of [{ ok: true }, { ok: true, handoff: "short" }, { ok: true, handoff: 5 }, null]) {
      const events = run(body);
      await vi.waitFor(() => expect(events).toEqual(["signed_in"]));
    }
  });
});

describe("full-screen jump", () => {
  it("puts the token in the fragment of /device-sign-in", () => {
    expect(fullScreenUrl("https://crm.example.test/", TOKEN)).toBe(`https://crm.example.test/device-sign-in#t=${TOKEN}`);
  });

  it("navigates the top window when allowed", () => {
    const top = { location: { href: "https://hl.example.test/" } };
    expect(tryTopNavigation(top, {}, "https://crm.example.test/device-sign-in#t=x")).toBe(true);
    expect(top.location.href).toBe("https://crm.example.test/device-sign-in#t=x");
  });

  it("returns false when the frame may not navigate the top window, or is the top window", () => {
    const blocked = {
      location: {
        get href() {
          return "";
        },
        set href(_value: string) {
          throw new Error("SecurityError");
        },
      },
    };
    expect(tryTopNavigation(blocked, {}, "https://crm.example.test/x")).toBe(false);
    const self = { location: { href: "" } };
    expect(tryTopNavigation(self, self, "https://crm.example.test/x")).toBe(false);
    expect(tryTopNavigation(null, {}, "https://crm.example.test/x")).toBe(false);
  });
});
