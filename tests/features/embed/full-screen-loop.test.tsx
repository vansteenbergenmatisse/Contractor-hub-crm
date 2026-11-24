// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimAutoJump, tryTopNavigation } from "@/features/embed";
import type { HandshakeDeps } from "../../../src/features/embed/api/handshake";

// Back-button loop (review blocker on 9f6689a): the automatic jump of HighLevel's top window must
// replace the history entry (so Back does not land on a page that jumps again) and happen at most once
// per browser tab, so a person who comes back to HighLevel's CRM page sees the buttons, including
// "Use it here, inside HighLevel", instead of being pushed out again.
const { startHandshake } = vi.hoisted(() => ({
  startHandshake: vi.fn<(deps: HandshakeDeps) => () => void>(() => () => {}),
}));
vi.mock("../../../src/features/embed/api/handshake", () => ({ startHandshake }));

import { EmbedBridge } from "../../../src/features/embed/components/EmbedBridge";

const TOKEN = "Q".repeat(43);

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

function finishWithToken() {
  const d = startHandshake.mock.calls.at(-1)![0];
  act(() => {
    d.onHandoff?.(TOKEN);
    d.onResult("signed_in");
  });
}

beforeEach(() => vi.clearAllMocks());

describe("tryTopNavigation", () => {
  it("uses location.replace, so the HighLevel page that jumped is not left in the history", () => {
    const replace = vi.fn();
    const location = { href: "https://hl.example.test/", replace };
    expect(tryTopNavigation({ location }, {}, "https://crm.example.test/device-sign-in#t=x")).toBe(true);
    expect(replace).toHaveBeenCalledWith("https://crm.example.test/device-sign-in#t=x");
    expect(location.href).toBe("https://hl.example.test/");
  });

  it("returns false when replace throws", () => {
    const location = {
      href: "",
      replace: () => {
        throw new Error("SecurityError");
      },
    };
    expect(tryTopNavigation({ location }, {}, "https://crm.example.test/x")).toBe(false);
  });
});

describe("claimAutoJump", () => {
  it("allows the automatic jump once per tab", () => {
    const storage = memoryStorage();
    expect(claimAutoJump(storage)).toBe(true);
    expect(claimAutoJump(storage)).toBe(false);
  });

  it("does not jump when the tab storage cannot be used (it could not remember the jump)", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(claimAutoJump(broken)).toBe(false);
    expect(claimAutoJump(null)).toBe(false);
  });
});

describe("EmbedBridge back-button", () => {
  it("jumps the top window on the first load only; a second load in the same tab shows the buttons", () => {
    const storage = memoryStorage();
    const replace = vi.fn();
    const top = { location: { href: "https://hl.example.test/crm", replace } };

    const first = render(<EmbedBridge goTo={vi.fn()} storage={() => storage} topWindow={() => top} />);
    finishWithToken();
    expect(replace).toHaveBeenCalledTimes(1);
    first.unmount();

    // Back from the full-screen CRM: HighLevel reloads /embed in the same tab and gets a new token.
    const goTo = vi.fn();
    render(<EmbedBridge goTo={goTo} storage={() => storage} topWindow={() => top} />);
    finishWithToken();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: "Open full screen" })).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Use it here, inside HighLevel" }).click());
    expect(goTo).toHaveBeenCalledWith("/");
  });
});
