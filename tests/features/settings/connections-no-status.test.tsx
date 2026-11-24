import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/features/app-shell", async () => {
  const { useReducer } = await import("react");
  return {
    useShell: () => ({}),
    useKeptReducer: (_key: string, r: never, a: never, i: never) => useReducer(r, a, i),
  };
});

import * as settings from "@/features/settings";
import type { PhoneNumbersView } from "@/features/settings";

const { SettingsPage, initialState } = settings;
const conn = (phoneNumbers?: PhoneNumbersView) => renderToStaticMarkup(<SettingsPage initial={{ ...initialState(), sec: "conn" }} phoneNumbers={phoneNumbers} />);
const rowOf = (html: string, name: string) => html.slice(html.indexOf(`>${name}<`), html.indexOf("</li>", html.indexOf(`>${name}<`)));

describe("Settings connections claim nothing without a source", () => {
  const html = conn();

  it("never says Connected, and offers no ask button or made-up status", () => {
    expect(html).not.toMatch(/>Connected</);
    expect(html).not.toContain("Connected:");
    expect(html).not.toContain("Ask Forge Forward to connect");
    expect(html).not.toContain("Noted on this screen");
    expect(html).not.toContain("A2P verified");
  });

  it("keeps Facebook, Instagram and Google My Business as Not connected yet", () => {
    for (const name of ["Facebook page", "Instagram", "Google My Business"]) expect(rowOf(html, name)).toContain("Not connected yet");
  });

  it("says Online payments is Not available yet", () => {
    expect(rowOf(html, "Online payments")).toContain("Not available yet");
  });

  it("hands Calendar and Gmail off to HighLevel with steps and no status chip", () => {
    for (const name of ["Calendar", "Gmail"]) {
      const row = rowOf(html, name);
      expect(html).toContain(`>${name}<`);
      expect(row).not.toContain("sv-chip");
    }
    expect((html.match(/<summary>Connect in HighLevel<\/summary>/g) ?? []).length).toBe(2);
  });

  it("no longer exports made-up statuses", () => {
    expect("MOCK_CONNECTIONS" in settings).toBe(false);
  });
});

describe("the business phone row", () => {
  it("always says the A2P status is not available", () => {
    const phones: (PhoneNumbersView | undefined)[] = [undefined, { state: "unavailable" }, { state: "ok", numbers: [{ number: "+15550100000", name: null }], complete: true }];
    for (const phone of phones) {
      expect(conn(phone)).toContain("A2P status: Not available yet");
    }
  });

  it("lists the real numbers with their names", () => {
    const html = conn({ state: "ok", numbers: [{ number: "+15550100000", name: "Main" }, { number: "+15550100001", name: null }], complete: true });
    expect(html).toContain("+15550100000, Main");
    expect(html).toContain("+15550100001");
    expect(html).not.toContain("more numbers");
  });

  it("says when the list may be short", () => {
    expect(conn({ state: "ok", numbers: [{ number: "+15550100000", name: null }], complete: false })).toContain("You may have more numbers than shown here.");
  });

  it("says when no number can text", () => {
    expect(conn({ state: "ok", numbers: [], complete: true })).toContain("No number that can text was found.");
  });

  it.each([
    ["no-access", "We do not have access to your phone numbers yet."],
    ["not-connected", "No phone system is connected yet."],
    ["inactive", "Your phone account is not active."],
    ["unavailable", "Your phone numbers could not be loaded."],
  ] as const)("explains %s", (state, text) => {
    const html = conn({ state });
    expect(html).toContain(text);
    expect(html).not.toMatch(/>Connected</);
  });

  it("does not take the number from the custom value", () => {
    const html = renderToStaticMarkup(<SettingsPage initialValues={{ business_phone_number: "+15550109999" }} initialSection="conn" />);
    expect(rowOf(html, "Business phone")).not.toContain("+15550109999");
  });
});
